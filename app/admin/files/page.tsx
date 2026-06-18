"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { PageHeader } from "@/components/PageHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { auth, db } from "@/lib/firebase";
import { handleSnapshotError } from "@/lib/firestore-errors";
import { formatDate } from "@/lib/utils";
import type { ExamResult, PdfFile } from "@/types/models";

export default function AdminFilesPage() {
  const { appUser } = useAuth();
  const [pdfs, setPdfs] = useState<PdfFile[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);

  useEffect(() => {
    if (appUser?.role !== "admin") return;
    return onSnapshot(collection(db, "pdfs"), (snapshot) => setPdfs(snapshot.docs.map((item) => item.data() as PdfFile)), (error) => handleSnapshotError(error, "admin files"));
  }, [appUser]);
  useEffect(() => {
    if (appUser?.role !== "admin") return;
    return onSnapshot(collection(db, "examResults"), (snapshot) => setResults(snapshot.docs.map((item) => item.data() as ExamResult)), (error) => handleSnapshotError(error, "admin performance"));
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
      toast.error(error instanceof Error ? error.message : "Could not delete PDF");
    }
  }

  return (
    <ProtectedRoute adminOnly>
      <AppShell>
        <PageHeader title="Admin Files & Performance" description="View uploaded PDFs and high-level exam performance records." />
        <div className="space-y-3">
          {pdfs.map((pdf) => (
            <Card key={pdf.pdfId} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold" title={pdf.fileName}>{pdf.fileName}</p>
                <p className="text-sm text-slate-500">
                  {pdf.userId} - {formatDate(pdf.uploadedAt)} - {pdf.totalQuestions} questions - {pdf.readyQuestions || 0} ready - {pdf.needsReviewQuestions || 0} review - {pdf.status}
                </p>
              </div>
              <Button variant="ghost" onClick={() => remove(pdf)} aria-label="Delete PDF"><Trash2 className="h-4 w-4 text-red-600" /></Button>
            </Card>
          ))}
          {!pdfs.length ? <Card className="text-center text-sm text-slate-500">No uploaded PDFs yet.</Card> : null}
        </div>
        <h2 className="mb-3 mt-8 font-bold">Recent Performance</h2>
        <div className="space-y-3">
          {results.slice(0, 20).map((result) => (
            <Card key={result.resultId} className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold">{result.pdfName}</p>
              <p className="text-sm text-slate-500">{result.userId} - {result.percentage}% - {result.correct}/{result.totalQuestions}</p>
            </Card>
          ))}
          {!results.length ? <Card className="text-center text-sm text-slate-500">No exam results yet.</Card> : null}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
