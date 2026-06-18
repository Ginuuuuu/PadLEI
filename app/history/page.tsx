"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/firebase";
import { handleSnapshotError } from "@/lib/firestore-errors";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";
import type { ExamResult } from "@/types/models";

export default function HistoryPage() {
  const { appUser } = useAuth();
  const [results, setResults] = useState<ExamResult[]>([]);

  useEffect(() => {
    if (!appUser) return;
    return onSnapshot(
      query(collection(db, "examResults"), where("userId", "==", appUser.uid)),
      (snapshot) => {
        setResults(snapshot.docs.map((item) => item.data() as ExamResult).sort((a, b) => b.date.localeCompare(a.date)));
      },
      (error) => handleSnapshotError(error, "exam history")
    );
  }, [appUser]);

  return (
    <ProtectedRoute>
      <AppShell>
        <PageHeader title="Exam History" description="Track score, time, accuracy, and full result reviews across attempts." />
        <div className="space-y-3">
          {results.map((result) => (
            <Card key={result.resultId} className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold">{result.pdfName}</h2>
                <p className="text-sm text-slate-500">{formatDate(result.date)} · {result.correct} correct · {result.wrong} wrong · {Math.round(result.timeTaken / 60)} min</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold">{result.percentage}%</span>
                <Button variant="secondary" asChild><Link href={`/exam/result/${result.resultId}`}>View full result</Link></Button>
              </div>
            </Card>
          ))}
          {!results.length ? <Card className="text-sm text-slate-500">No exam attempts yet.</Card> : null}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
