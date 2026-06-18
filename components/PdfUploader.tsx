"use client";

import { useState } from "react";
import { FileUp } from "lucide-react";
import toast from "react-hot-toast";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import { Card } from "@/components/ui/card";

const maxSizeMb = 20;

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
      setStage("extracting");
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Login required.");

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
      const uploaded = await readPayload<{
        pdfId?: string;
        storagePath?: string;
        bucketName?: string;
        localFallback?: boolean;
        totalQuestions?: number;
        readyQuestions?: number;
        needsReview?: number;
        extractionError?: string;
        error?: string;
      }>(uploadResponse);
      if (!uploadResponse.ok || !uploaded.pdfId || !uploaded.storagePath) throw new Error(uploaded.error || "Upload failed.");

      if (uploaded.extractionError) {
        toast.error(`PDF uploaded, but extraction failed: ${uploaded.extractionError}`, { duration: 10000 });
      } else if (uploaded.needsReview) {
        toast.success(`${uploaded.localFallback ? "PDF saved locally. " : "PDF uploaded. "}${uploaded.readyQuestions || 0} ready, ${uploaded.needsReview} need review.`);
      } else {
        toast.success(`${uploaded.localFallback ? "PDF saved locally. " : "PDF uploaded. "}${uploaded.totalQuestions || 0} questions are ready.`);
      }
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
