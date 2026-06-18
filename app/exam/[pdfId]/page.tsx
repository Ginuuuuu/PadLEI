"use client";

import { FormEvent, useEffect, useState } from "react";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ExamRunner } from "@/components/ExamRunner";
import { PageHeader } from "@/components/PageHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { db } from "@/lib/firebase";
import { handleSnapshotError } from "@/lib/firestore-errors";
import { safeNumber } from "@/lib/utils";
import type { ExamSettings, PdfFile, Question } from "@/types/models";

export default function ExamPage() {
  const params = useParams<{ pdfId: string }>();
  const { appUser } = useAuth();
  const [pdf, setPdf] = useState<PdfFile | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [settings, setSettings] = useState<ExamSettings | null>(null);
  const maxQuestion = Math.max(...questions.map((item) => item.questionNumber), 1);

  useEffect(() => {
    if (!appUser) return;
    getDoc(doc(db, "pdfs", params.pdfId)).then((snapshot) => setPdf(snapshot.data() as PdfFile));
    return onSnapshot(
      query(collection(db, "questions"), where("pdfId", "==", params.pdfId), where("userId", "==", appUser.uid)),
      (snapshot) => {
        setQuestions(snapshot.docs.map((item) => item.data() as Question));
      },
      (error) => handleSnapshotError(error, "exam questions")
    );
  }, [appUser, params.pdfId]);

  function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSettings({
      pdfId: params.pdfId,
      pdfName: pdf?.fileName || "PDF",
      questionCount: safeNumber(form.get("questionCount"), 10),
      fromQuestion: safeNumber(form.get("fromQuestion"), 1),
      toQuestion: safeNumber(form.get("toQuestion"), maxQuestion),
      order: form.get("order") === "random" ? "random" : "sequential",
      timerMinutes: safeNumber(form.get("timerMinutes"), 0) || undefined,
      marksPerCorrect: safeNumber(form.get("marksPerCorrect"), 1),
      negativeMarks: form.get("negativeMarks") === "on",
      negativeValue: safeNumber(form.get("negativeValue"), 0)
    });
  }

  return (
    <ProtectedRoute>
      <AppShell>
        <PageHeader title={settings ? "Mock Test" : "Configure Mock Test"} description={pdf?.fileName || "Set your test preferences before beginning."} />
        {settings ? (
          <ExamRunner allQuestions={questions} settings={settings} />
        ) : (
          <Card>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={start}>
              <Field label="From question"><Input name="fromQuestion" type="number" min={1} defaultValue={1} /></Field>
              <Field label="To question"><Input name="toQuestion" type="number" min={1} defaultValue={maxQuestion} /></Field>
              <Field label="Number of questions"><Input name="questionCount" type="number" min={1} defaultValue={Math.min(30, questions.length || 30)} /></Field>
              <Field label="Order"><Select name="order" defaultValue="random"><option value="random">Random</option><option value="sequential">Sequential</option></Select></Field>
              <Field label="Optional timer minutes"><Input name="timerMinutes" type="number" min={0} placeholder="No timer" /></Field>
              <Field label="Marks per correct"><Input name="marksPerCorrect" type="number" min={1} defaultValue={1} /></Field>
              <label className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm font-semibold"><input name="negativeMarks" type="checkbox" /> Enable negative marks</label>
              <Field label="Negative value"><Input name="negativeValue" type="number" min={0} step="0.25" defaultValue={0} /></Field>
              <Button className="sm:col-span-2">Start exam</Button>
            </form>
          </Card>
        )}
      </AppShell>
    </ProtectedRoute>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-2 text-sm font-semibold text-slate-700"><span>{label}</span>{children}</label>;
}
