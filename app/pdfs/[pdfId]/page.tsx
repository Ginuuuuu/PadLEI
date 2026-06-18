"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { QuestionEditor } from "@/components/QuestionEditor";

export default function PdfDetailsPage() {
  const params = useParams<{ pdfId: string }>();
  return (
    <ProtectedRoute>
      <AppShell>
        <PageHeader title="Review Extracted Questions" description="Fix uncertain OCR or AI extraction before using questions in study and exam mode." />
        <QuestionEditor pdfId={params.pdfId} />
      </AppShell>
    </ProtectedRoute>
  );
}
