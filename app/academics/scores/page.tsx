"use client";

import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ScoreManager } from "@/components/ScoreManager";

export default function ScoresPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <PageHeader title="Actual AVN Scores" description="Track real university exam percentages and compare them with PadLEI mock-test performance." />
        <ScoreManager />
      </AppShell>
    </ProtectedRoute>
  );
}
