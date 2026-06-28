"use client";

import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ReportCenter } from "@/components/ReportCenter";

export default function ReportsPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <PageHeader title="Performance Reports" description="Download each mock-test, AVN, subject, semester, or overall report separately in a print-ready A4 format." />
        <ReportCenter />
      </AppShell>
    </ProtectedRoute>
  );
}
