"use client";

import { AppShell } from "@/components/AppShell";
import { LibraryView } from "@/components/LibraryView";
import { PageHeader } from "@/components/PageHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export default function LibraryPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <PageHeader title="Library" description="Organize every PDF by semester and subject without losing questions, progress, or exam history." />
        <LibraryView />
      </AppShell>
    </ProtectedRoute>
  );
}
