"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ResultView } from "@/components/ResultView";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/firebase";
import type { ExamResult } from "@/types/models";

export default function ResultPage() {
  const params = useParams<{ resultId: string }>();
  const [result, setResult] = useState<ExamResult | null>(null);

  useEffect(() => {
    getDoc(doc(db, "examResults", params.resultId)).then((snapshot) => setResult(snapshot.data() as ExamResult));
  }, [params.resultId]);

  return (
    <ProtectedRoute>
      <AppShell>
        <PageHeader title="Exam Result" description="Review every answer and use mistakes as your next study list." />
        {result ? <ResultView result={result} /> : <Card>Loading result...</Card>}
      </AppShell>
    </ProtectedRoute>
  );
}
