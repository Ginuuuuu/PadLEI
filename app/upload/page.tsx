"use client";

import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { PdfList } from "@/components/PdfList";
import { PdfUploader } from "@/components/PdfUploader";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export default function UploadPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <PageHeader title="PDF Uploads" description="Upload MCQ PDFs, extract questions, and open them for review, study, or mock tests." />
        <div className="space-y-6">
          <PdfUploader />
          <PdfList />
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
