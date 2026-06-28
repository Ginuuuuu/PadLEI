"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, ClipboardList, FileDown } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { LibraryView } from "@/components/LibraryView";
import { PageHeader } from "@/components/PageHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { QuoteCard } from "@/components/QuoteCard";
import { ScoreManager } from "@/components/ScoreManager";
import { TimetableManager } from "@/components/TimetableManager";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/components/AuthProvider";

export default function DashboardPage() {
  const { appUser } = useAuth();
  return (
    <ProtectedRoute>
      <AppShell>
        <PageHeader title={`Welcome${appUser?.name ? `, ${appUser.name}` : ""}`} description="Your study library, upcoming exams, and academic performance at a glance." />
        <div className="space-y-5">
          <QuoteCard />
          <div className="grid gap-4 lg:grid-cols-2">
            <TimetableManager summary />
            <ScoreManager summary />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <BookOpen className="h-7 w-7 text-aqua" />
              <h2 className="mt-4 font-bold">Continue studying</h2>
              <p className="mt-1 text-sm text-slate-500">Open the organized library and continue from your saved progress.</p>
              <Button className="mt-4" asChild><Link href="/library">Open library <ArrowRight className="h-4 w-4" /></Link></Button>
            </Card>
            <Card>
              <ClipboardList className="h-7 w-7 text-berry" />
              <h2 className="mt-4 font-bold">Start a mock test</h2>
              <p className="mt-1 text-sm text-slate-500">Configure question range, timer, marks, and shuffled choices.</p>
              <Button className="mt-4" variant="secondary" asChild><Link href="/exam/setup">Set up mock test</Link></Button>
            </Card>
          </div>
          <section className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-bold">Recent organized PDFs</h2>
              <Link className="text-sm font-semibold text-aqua" href="/library">View full library</Link>
            </div>
            <LibraryView compact />
          </section>
          <div className="flex flex-col items-start justify-between gap-3 border-t border-slate-200 py-5 dark:border-slate-800 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-bold">Performance reports</h2>
              <p className="mt-1 text-sm text-slate-500">Download mock-test, AVN, subject, semester, or overall reports separately.</p>
            </div>
            <Button variant="secondary" asChild><Link href="/academics/reports"><FileDown className="h-4 w-4" /> Open reports</Link></Button>
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
