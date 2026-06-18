"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { BookOpen, FileText, PencilLine, RotateCw, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { auth, db } from "@/lib/firebase";
import { handleSnapshotError } from "@/lib/firestore-errors";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { PdfFile } from "@/types/models";

export function PdfList({ limit }: { limit?: number }) {
  const { appUser } = useAuth();
  const [pdfs, setPdfs] = useState<PdfFile[]>([]);

  useEffect(() => {
    if (!appUser) return;
    return onSnapshot(
      query(collection(db, "pdfs"), where("userId", "==", appUser.uid)),
      (snapshot) => {
        setPdfs(snapshot.docs.map((item) => item.data() as PdfFile).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)));
      },
      (error) => handleSnapshotError(error, "PDFs")
    );
  }, [appUser]);

  async function remove(pdf: PdfFile) {
    if (!confirm(`Delete ${pdf.fileName}?`)) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/delete-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ pdfId: pdf.pdfId })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Delete failed");
      toast.success("PDF deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete PDF", { duration: 8000 });
    }
  }

  async function reprocess(pdf: PdfFile) {
    if (!appUser) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/extract-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ pdfId: pdf.pdfId, userId: appUser.uid, storagePath: pdf.storagePath, bucketName: pdf.bucketName })
      });
      const payload = (await response.json()) as { totalQuestions?: number; needsReview?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Extraction failed");
      toast.success(`Processed ${payload.totalQuestions || 0} questions`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reprocess PDF", { duration: 8000 });
    }
  }

  const items = typeof limit === "number" ? pdfs.slice(0, limit) : pdfs;

  if (!items.length) {
    return <Card className="text-center text-sm text-slate-500">No PDFs yet. Upload a question paper to start studying.</Card>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((pdf) => (
        <Card key={pdf.pdfId}>
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-berry/10 text-berry">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-semibold">{pdf.fileName}</h3>
              <p className="mt-1 text-xs text-slate-500">{formatDate(pdf.uploadedAt)}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-lg bg-slate-100 px-2 py-1">{pdf.status}</span>
                <span className="rounded-lg bg-slate-100 px-2 py-1">{pdf.totalQuestions} questions</span>
              </div>
            </div>
          </div>
          {pdf.errorMessage ? <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{pdf.errorMessage}</p> : null}
          <div className="mt-5 grid grid-cols-[1fr_1fr_44px_44px] gap-2">
            <Button className="flex-1" asChild>
              <Link href={`/study/${pdf.pdfId}`}><BookOpen className="h-4 w-4" /> Study</Link>
            </Button>
            <Button className="flex-1" variant="secondary" asChild>
              <Link href={`/exam/${pdf.pdfId}`}>Exam</Link>
            </Button>
            <Button className="px-0" variant="secondary" asChild>
              <Link href={`/pdfs/${pdf.pdfId}`} aria-label="Review questions"><PencilLine className="h-4 w-4" /></Link>
            </Button>
            <Button className="px-0" variant="secondary" onClick={() => reprocess(pdf)} aria-label="Retry extraction">
              <RotateCw className="h-4 w-4" />
            </Button>
          </div>
          <Button className="mt-2 w-full" variant="danger" onClick={() => remove(pdf)}>
            <Trash2 className="h-4 w-4" />
            Delete PDF
          </Button>
        </Card>
      ))}
    </div>
  );
}
