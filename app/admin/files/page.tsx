"use client";

import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot } from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { db, storage } from "@/lib/firebase";
import { handleSnapshotError } from "@/lib/firestore-errors";
import { formatDate } from "@/lib/utils";
import type { ExamResult, PdfFile } from "@/types/models";

export default function AdminFilesPage() {
  const [pdfs, setPdfs] = useState<PdfFile[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);

  useEffect(() => onSnapshot(collection(db, "pdfs"), (snapshot) => setPdfs(snapshot.docs.map((item) => item.data() as PdfFile)), (error) => handleSnapshotError(error, "admin files")), []);
  useEffect(() => onSnapshot(collection(db, "examResults"), (snapshot) => setResults(snapshot.docs.map((item) => item.data() as ExamResult)), (error) => handleSnapshotError(error, "admin performance")), []);

  async function remove(pdf: PdfFile) {
    if (!confirm(`Delete ${pdf.fileName}?`)) return;
    await deleteDoc(doc(db, "pdfs", pdf.pdfId));
    await deleteObject(ref(storage, pdf.storagePath)).catch(() => undefined);
  }

  return (
    <ProtectedRoute adminOnly>
      <AppShell>
        <PageHeader title="Admin Files & Performance" description="View uploaded PDFs and high-level exam performance records." />
        <div className="space-y-3">
          {pdfs.map((pdf) => (
            <Card key={pdf.pdfId} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{pdf.fileName}</p>
                <p className="text-sm text-slate-500">{pdf.userId} · {formatDate(pdf.uploadedAt)} · {pdf.totalQuestions} questions · {pdf.status}</p>
              </div>
              <Button variant="ghost" onClick={() => remove(pdf)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
            </Card>
          ))}
        </div>
        <h2 className="mb-3 mt-8 font-bold">Recent Performance</h2>
        <div className="space-y-3">
          {results.slice(0, 20).map((result) => (
            <Card key={result.resultId} className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold">{result.pdfName}</p>
              <p className="text-sm text-slate-500">{result.userId} · {result.percentage}% · {result.correct}/{result.totalQuestions}</p>
            </Card>
          ))}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
