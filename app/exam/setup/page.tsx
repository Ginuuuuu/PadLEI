"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/firebase";
import { dataOwnerId } from "@/lib/account";
import { handleSnapshotError } from "@/lib/firestore-errors";
import { useAuth } from "@/components/AuthProvider";
import type { PdfFile } from "@/types/models";

export default function ExamSetupListPage() {
  const { appUser } = useAuth();
  const [pdfs, setPdfs] = useState<PdfFile[]>([]);

  useEffect(() => {
    if (!appUser) return;
    return onSnapshot(
      query(collection(db, "pdfs"), where("userId", "==", dataOwnerId(appUser))),
      (snapshot) => {
        const items = snapshot.docs.map((item) => item.data() as PdfFile);
        setPdfs(items.sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt)));
      },
      (error) => handleSnapshotError(error, "exam PDFs")
    );
  }, [appUser]);

  return (
    <ProtectedRoute>
      <AppShell>
        <PageHeader title="Mock Test Setup" description="Choose a PDF first, then configure range, count, order, timer, and marks." />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pdfs.map((pdf) => {
            const total = pdf.totalQuestions || 0;
            const needsReview = pdf.needsReviewQuestions || 0;
            const ready = pdf.readyQuestions ?? Math.max(0, total - needsReview);
            const canStart = ready > 0;

            return (
              <Card key={pdf.pdfId}>
                <h2 className="line-clamp-2 font-semibold" title={pdf.fileName}>{pdf.fileName}</h2>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <span className="rounded-lg bg-slate-50 px-2 py-2"><b className="block text-sm text-ink">{total}</b>Total</span>
                  <span className="rounded-lg bg-emerald-50 px-2 py-2 text-emerald-700"><b className="block text-sm">{ready}</b>Ready</span>
                  <span className="rounded-lg bg-amber-50 px-2 py-2 text-amber-700"><b className="block text-sm">{needsReview}</b>Review</span>
                </div>
                {canStart ? (
                  <Button className="mt-4 w-full" asChild><Link href={`/exam/${pdf.pdfId}`}>Configure test</Link></Button>
                ) : (
                  <Button className="mt-4 w-full" variant="secondary" asChild><Link href={`/pdfs/${pdf.pdfId}`}>Review questions</Link></Button>
                )}
              </Card>
            );
          })}
          {!pdfs.length ? (
            <Card className="md:col-span-2 xl:col-span-3">
              <p className="text-sm text-slate-600">No PDFs yet. Upload a question paper to create a mock test.</p>
              <Button className="mt-4" asChild><Link href="/upload">Upload PDF</Link></Button>
            </Card>
          ) : null}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
