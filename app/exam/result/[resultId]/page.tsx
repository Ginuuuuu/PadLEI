"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ResultView } from "@/components/ResultView";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { hydrateExamResultDiagrams, loadExamResult } from "@/lib/exam-results-client";
import type { ExamResult } from "@/types/models";

export default function ResultPage() {
  const params = useParams<{ resultId: string }>();
  const [result, setResult] = useState<ExamResult | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError("");
    loadExamResult(params.resultId)
      .then((loaded) => {
        if (cancelled) return;
        setResult(loaded);
        return hydrateExamResultDiagrams(loaded);
      })
      .then((hydrated) => {
        if (!cancelled && hydrated) setResult(hydrated);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load this exam result.");
      });
    return () => {
      cancelled = true;
    };
  }, [params.resultId, reloadKey]);

  return (
    <ProtectedRoute>
      <AppShell>
        <PageHeader title="Exam Result" description="Review every answer and use mistakes as your next study list." />
        {result ? <ResultView result={result} /> : error ? (
          <Card className="text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-red-600" />
            <p className="mt-3 font-semibold">The result could not be loaded.</p>
            <p className="mt-1 text-sm text-slate-500">{error}</p>
            <Button className="mt-4" onClick={() => setReloadKey((value) => value + 1)}>
              <RefreshCw className="h-4 w-4" /> Retry
            </Button>
          </Card>
        ) : (
          <Card className="flex items-center justify-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading result...
          </Card>
        )}
      </AppShell>
    </ProtectedRoute>
  );
}
