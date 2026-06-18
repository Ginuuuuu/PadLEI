"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { StudyViewer } from "@/components/StudyViewer";

export default function StudyPage() {
  const params = useParams<{ pdfId: string }>();
  return (
    <ProtectedRoute>
      <AppShell>
        <PageHeader title="Study Mode" description="Move question by question, reveal answers when ready, and keep track of learning progress." />
        <StudyViewer pdfId={params.pdfId} />
      </AppShell>
    </ProtectedRoute>
  );
}
