"use client";

import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { TimetableManager } from "@/components/TimetableManager";

export default function TimetablePage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <PageHeader title="Exam Timetable" description="Plan AVNs, practicals, vivas, and finals with clear status and in-app reminders." />
        <TimetableManager />
      </AppShell>
    </ProtectedRoute>
  );
}
