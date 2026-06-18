"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, ClipboardList } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { QuoteCard } from "@/components/QuoteCard";
import { PdfList } from "@/components/PdfList";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/components/AuthProvider";

export default function DashboardPage() {
  const { appUser } = useAuth();
  return (
    <ProtectedRoute>
      <AppShell>
        <PageHeader title={`Welcome${appUser?.name ? `, ${appUser.name}` : ""}`} description="Pick up where you left off, revise smarter, and turn every mock test into a clearer plan." />
        <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-5">
            <QuoteCard />
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <BookOpen className="h-7 w-7 text-aqua" />
                <h2 className="mt-4 font-bold">Continue Studying</h2>
                <p className="mt-1 text-sm text-slate-500">Review answers, bookmark weak areas, and mark learned questions.</p>
                <Button className="mt-4" asChild><Link href="/upload">Open PDFs <ArrowRight className="h-4 w-4" /></Link></Button>
              </Card>
              <Card>
                <ClipboardList className="h-7 w-7 text-berry" />
                <h2 className="mt-4 font-bold">Start Mock Test</h2>
                <p className="mt-1 text-sm text-slate-500">Choose range, count, timer, marks, and question order.</p>
                <Button className="mt-4" variant="secondary" asChild><Link href="/exam/setup">Setup exam</Link></Button>
              </Card>
            </div>
            <section>
              <h2 className="mb-3 font-bold">Recent uploaded PDFs</h2>
              <PdfList limit={3} />
            </section>
          </div>
          <Card className="h-fit">
            <h2 className="font-bold">Progress Overview</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <p>Study progress and exam history update automatically as you use each PDF.</p>
              <Link className="font-semibold text-aqua" href="/history">View exam history</Link>
            </div>
          </Card>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
