"use client";

import Link from "next/link";
import { BarChart3, CalendarDays, FileDown, History } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ScoreManager } from "@/components/ScoreManager";
import { TimetableManager } from "@/components/TimetableManager";
import { Card } from "@/components/ui/card";

const academicsLinks = [
  { href: "/academics/timetable", label: "Exam timetable", description: "Plan exams, status changes, and reminders.", icon: CalendarDays },
  { href: "/academics/scores", label: "Actual AVN scores", description: "Record and compare university results.", icon: BarChart3 },
  { href: "/academics/reports", label: "Performance reports", description: "Download separate professional PDF reports.", icon: FileDown },
  { href: "/history", label: "Mock-test history", description: "Review every mock-test attempt and answer.", icon: History }
];

export default function AcademicsPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <PageHeader title="Academics" description="Your exam plan, actual AVN performance, mock-test history, and reports in one place." />
        <div className="grid gap-4 lg:grid-cols-2">
          <TimetableManager summary />
          <ScoreManager summary />
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {academicsLinks.map((item) => (
            <Link key={item.href} href={item.href} className="focus-ring rounded-lg">
              <Card className="h-full transition hover:border-aqua/40">
                <item.icon className="h-6 w-6 text-aqua" />
                <h2 className="mt-4 font-bold">{item.label}</h2>
                <p className="mt-1 text-sm text-slate-500">{item.description}</p>
              </Card>
            </Link>
          ))}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
