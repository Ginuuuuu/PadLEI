"use client";

import { useState } from "react";
import { FileUp } from "lucide-react";
import toast from "react-hot-toast";
import { auth } from "@/lib/firebase";
import { parseMcqLines, parseMcqText, sanitizeText, type ExtractedLine, type ParsedQuestion } from "@/lib/extraction";
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

type BrowserPdfTextItem = {
  str: string;
  width?: number;
  height?: number;
  transform: number[];
  fontName?: string;
};

type BrowserLineGroup = {
  y: number;
  items: Array<{
    text: string;
    x0: number;
    x1: number;
    skew: number;
    fontName?: string;
  }>;
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
  const lines: ExtractedLine[] = [];
  const maxPages = Math.min(document.numPages, 80);

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const textItems = content.items.filter(isBrowserPdfTextItem) as BrowserPdfTextItem[];
    const viewport = page.getViewport({ scale: 1 });
    const groupedLines = groupBrowserTextItems(textItems, viewport);

    for (const group of groupedLines) {
      const text = buildBrowserLineText(group.items);
      if (!text) continue;
      lines.push({
        text,
        styled: detectBrowserStyledAnswer(group)
      });
    }
  }

  const text = sanitizeText(lines.map((line) => line.text).join("\n"));
  const lineQuestions = lines.length ? parseMcqLines(lines) : [];
  const fallbackQuestions = text ? parseMcqText(text) : [];
  const questions = extractionScore(lineQuestions) >= extractionScore(fallbackQuestions) ? lineQuestions : fallbackQuestions;

  return {
    questions,
    source: document.numPages > maxPages ? `browser PDF line extraction, first ${maxPages} pages` : "browser PDF line extraction"
  };
}

function isBrowserPdfTextItem(item: unknown): item is BrowserPdfTextItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    typeof (item as { str?: unknown }).str === "string" &&
    Boolean((item as { str: string }).str.trim()) &&
    Array.isArray((item as { transform?: unknown }).transform)
  );
}

function groupBrowserTextItems(
  items: BrowserPdfTextItem[],
  viewport: { convertToViewportPoint: (x: number, y: number) => number[] }
) {
  const groups: BrowserLineGroup[] = [];

  for (const item of items) {
    const text = item.str.trim();
    if (!text) continue;
    const pdfX = item.transform[4];
    const pdfY = item.transform[5];
    let group = groups.find((candidate) => Math.abs(candidate.y - pdfY) < 3);
    if (!group) {
      group = { y: pdfY, items: [] };
      groups.push(group);
    }

    const [x] = viewport.convertToViewportPoint(pdfX, pdfY);
    const width = item.width || Math.max(text.length * (item.height || 10) * 0.45, 8);
    group.items.push({
      text,
      x0: x,
      x1: x + width,
      skew: item.transform[2] || 0,
      fontName: item.fontName
    });
  }

  return groups.sort((a, b) => b.y - a.y).map((group) => ({ ...group, items: group.items.sort((a, b) => a.x0 - b.x0) }));
}

function buildBrowserLineText(items: BrowserLineGroup["items"]) {
  let text = "";
  let previousX = 0;

  for (const item of items) {
    const gap = item.x0 - previousX;
    if (text && gap > 5 && !text.endsWith(" ") && !item.text.startsWith(" ")) text += " ";
    text += item.text;
    previousX = item.x1;
  }

  return text.replace(/\s+/g, " ").trim();
}

function detectBrowserStyledAnswer(group: BrowserLineGroup) {
  const text = buildBrowserLineText(group.items);
  if (!/^(?:[\u2713\u2714\u2705\u2611\u221a]\s*|\[\s*x\s*\]\s*|\(\s*x\s*\)\s*)?(?:Hint\s*)?(?:\(?[A-F]\)?|[1-6])[\).:\-]/i.test(text)) return false;
  return group.items.some((item) => Math.abs(item.skew) > 0.5 || /italic|oblique/i.test(item.fontName || ""));
}

function usableQuestionCount(questions: ParsedQuestion[]) {
  return questions.filter((question) => {
    const optionCount = Object.values(question.options || {}).filter((value) => value?.trim()).length;
    return question.questionText?.trim() && optionCount >= 2;
  }).length;
}

function extractionScore(questions: ParsedQuestion[]) {
  const readyCount = questions.filter((question) => question.status === "ready").length;
  return usableQuestionCount(questions) * 4 + readyCount * 2;
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
