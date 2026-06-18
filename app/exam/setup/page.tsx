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
import { handleSnapshotError } from "@/lib/firestore-errors";
import { useAuth } from "@/components/AuthProvider";
import type { PdfFile } from "@/types/models";

export default function ExamSetupListPage() {
  const { appUser } = useAuth();
  const [pdfs, setPdfs] = useState<PdfFile[]>([]);

  useEffect(() => {
    if (!appUser) return;
    return onSnapshot(
      query(collection(db, "pdfs"), where("userId", "==", appUser.uid)),
      (snapshot) => setPdfs(snapshot.docs.map((item) => item.data() as PdfFile)),
      (error) => handleSnapshotError(error, "exam PDFs")
    );
  }, [appUser]);

  return (
    <ProtectedRoute>
      <AppShell>
        <PageHeader title="Mock Test Setup" description="Choose a PDF first, then configure range, count, order, timer, and marks." />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pdfs.map((pdf) => (
            <Card key={pdf.pdfId}>
              <h2 className="font-semibold">{pdf.fileName}</h2>
              <p className="mt-2 text-sm text-slate-500">{pdf.totalQuestions} extracted questions</p>
              <Button className="mt-4" asChild><Link href={`/exam/${pdf.pdfId}`}>Configure test</Link></Button>
            </Card>
          ))}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
