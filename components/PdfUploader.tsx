"use client";

import { useState } from "react";
import { FileUp } from "lucide-react";
import toast from "react-hot-toast";
import { auth } from "@/lib/firebase";
import { parseMcqText, sanitizeText, type ParsedQuestion } from "@/lib/extraction";
import { useAuth } from "@/components/AuthProvider";
import { Card } from "@/components/ui/card";

const maxSizeMb = 20;
const vercelSafeFallbackMb = 4;

type UploadResult = {
  pdfId?: string;
  storagePath?: string;
  bucketName?: string;
  localFallback?: boolean;
  totalQuestions?: number;
  readyQuestions?: number;
  needsReview?: number;
  extractionError?: string;
  error?: string;
};

type CloudinarySignature = {
  pdfId: string;
  apiKey: string;
  bucketName: string;
  cloudName: string;
  publicId: string;
  signature: string;
  storagePath: string;
  timestamp: number;
  uploadUrl: string;
  error?: string;
};

type CloudinaryUpload = {
  secure_url?: string;
  error?: { message?: string };
};

type BrowserExtraction = {
  questions: ParsedQuestion[];
  source: string;
};

async function readPayload<T extends { error?: string }>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text.slice(0, 500) } as T;
  }
}

export function PdfUploader() {
  const { appUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"idle" | "uploading" | "extracting">("idle");

  async function handleUpload(file?: File) {
    if (!file || !appUser) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) return toast.error("Only PDF files are allowed.");
    if (file.size > maxSizeMb * 1024 * 1024) return toast.error(`PDF must be under ${maxSizeMb} MB.`);

    setBusy(true);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Login required.");

      setStage("extracting");
      let browserExtraction: BrowserExtraction;
      try {
        browserExtraction = await extractQuestionsInBrowser(file);
      } catch (error) {
        browserExtraction = {
          questions: [],
          source: `browser PDF extraction unavailable: ${error instanceof Error ? error.message : "unknown error"}`
        };
      }

      setStage("uploading");
      const directUpload = await requestCloudinarySignature(file, token);
      if (directUpload) {
        const cloudinaryUpload = await uploadDirectlyToCloudinary(file, directUpload);
        setStage("extracting");
        const uploaded = await completeCloudinaryUpload(file, token, directUpload, cloudinaryUpload.secure_url || "", browserExtraction);
        showUploadResult(uploaded);
        return;
      }

      setStage("extracting");
      const uploadForm = new FormData();
      uploadForm.append("file", file);

      const uploadController = new AbortController();
      const uploadTimeout = window.setTimeout(() => uploadController.abort(), 300000);
      const uploadResponse = await fetch("/api/upload-pdf", {
        method: "POST",
        cache: "no-store",
        signal: uploadController.signal,
        headers: { Authorization: `Bearer ${token}` },
        body: uploadForm
      });
      window.clearTimeout(uploadTimeout);
      const uploaded = await readPayload<UploadResult>(uploadResponse);
      if (!uploadResponse.ok || !uploaded.pdfId || !uploaded.storagePath) throw new Error(uploaded.error || "Upload failed.");

      showUploadResult(uploaded);
    } catch (error) {
      const message = error instanceof Error && error.name === "AbortError" ? "Upload or extraction timed out. Try a smaller PDF." : error instanceof Error ? error.message : "Upload failed";
      toast.error(message, { duration: 8000 });
    } finally {
      setBusy(false);
      setStage("idle");
    }
  }

  return (
    <Card className="border-dashed border-aqua/40 bg-white/80">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg px-6 py-10 text-center">
        <FileUp className="h-10 w-10 text-aqua" />
        <div>
          <p className="font-semibold">Upload MCQ PDF</p>
          <p className="text-sm text-slate-500">PDF only, up to {maxSizeMb} MB. Questions are extracted automatically.</p>
        </div>
        <input
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          disabled={busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            void handleUpload(file);
          }}
        />
        <span className="inline-flex h-11 items-center justify-center rounded-lg bg-ink px-4 text-sm font-semibold text-white">
          {busy ? (stage === "extracting" ? "Processing PDF..." : "Uploading PDF...") : "Choose PDF"}
        </span>
      </label>
      {busy ? <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-full animate-pulse bg-aqua transition-all" /></div> : null}
    </Card>
  );
}

async function extractQuestionsInBrowser(file: File): Promise<BrowserExtraction> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  const document = await pdfjsLib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
    useSystemFonts: true
  }).promise;
  const pages: string[] = [];
  const maxPages = Math.min(document.numPages, 80);

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join("\n"));
  }

  const text = sanitizeText(pages.join("\n\n"));
  const questions = text ? parseMcqText(text) : [];
  return {
    questions,
    source: document.numPages > maxPages ? `browser PDF text extraction, first ${maxPages} pages` : "browser PDF text extraction"
  };
}

async function requestCloudinarySignature(file: File, token: string) {
  const response = await fetch("/api/cloudinary/sign-pdf-upload", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ fileName: file.name, fileSize: file.size, contentType: file.type })
  });
  const payload = await readPayload<CloudinarySignature>(response);
  if (response.ok) return payload;

  if (file.size > vercelSafeFallbackMb * 1024 * 1024) {
    throw new Error(payload.error || "Large PDFs must be uploaded directly to Cloudinary. Check Cloudinary environment variables in Vercel.");
  }

  return null;
}

async function uploadDirectlyToCloudinary(file: File, signature: CloudinarySignature) {
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", signature.apiKey);
  form.append("timestamp", String(signature.timestamp));
  form.append("public_id", signature.publicId);
  form.append("overwrite", "true");
  form.append("signature", signature.signature);

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 300000);
  const response = await fetch(signature.uploadUrl, {
    method: "POST",
    signal: controller.signal,
    body: form
  });
  window.clearTimeout(timeout);

  const payload = (await response.json().catch(() => ({}))) as CloudinaryUpload;
  if (!response.ok || !payload.secure_url) {
    throw new Error(`Cloudinary upload failed: ${payload.error?.message || response.statusText}`);
  }

  return payload;
}

async function completeCloudinaryUpload(file: File, token: string, signature: CloudinarySignature, fileUrl: string, extraction: BrowserExtraction) {
  const response = await fetch("/api/cloudinary/complete-pdf-upload", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      pdfId: signature.pdfId,
      fileName: file.name,
      fileUrl,
      storagePath: signature.storagePath,
      bucketName: signature.bucketName,
      extractedQuestions: extraction.questions,
      extractionSource: extraction.source
    })
  });
  const payload = await readPayload<UploadResult>(response);
  if (!response.ok || !payload.pdfId || !payload.storagePath) throw new Error(payload.error || "PDF uploaded, but extraction could not start.");
  return payload;
}

function showUploadResult(uploaded: UploadResult) {
  if (uploaded.extractionError) {
    toast.error(`PDF uploaded, but extraction failed: ${uploaded.extractionError}`, { duration: 10000 });
  } else if (uploaded.needsReview) {
    toast.success(`${uploaded.localFallback ? "PDF saved locally. " : "PDF uploaded. "}${uploaded.readyQuestions || 0} ready, ${uploaded.needsReview} need review.`);
  } else {
    toast.success(`${uploaded.localFallback ? "PDF saved locally. " : "PDF uploaded. "}${uploaded.totalQuestions || 0} questions are ready.`);
  }
}
