"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
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
import { dataOwnerId } from "@/lib/account";
import { readExamDraft } from "@/lib/exam-draft";
import { handleSnapshotError } from "@/lib/firestore-errors";
import { isReadyQuestion } from "@/lib/question-options";
import { safeNumber } from "@/lib/utils";
import type { ExamSettings, PdfFile, Question } from "@/types/models";

export default function ExamPage() {
  const params = useParams<{ pdfId: string }>();
  const { appUser } = useAuth();
  const [pdf, setPdf] = useState<PdfFile | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [settings, setSettings] = useState<ExamSettings | null>(null);
  const [draftCheckedFor, setDraftCheckedFor] = useState("");
  const readyQuestions = questions.filter(isReadyQuestion);
  const reviewCount = Math.max(0, questions.length - readyQuestions.length);
  const maxQuestion = Math.max(...readyQuestions.map((item) => item.questionNumber), 1);

  useEffect(() => {
    if (!appUser) return;
    getDoc(doc(db, "pdfs", params.pdfId)).then((snapshot) => setPdf(snapshot.data() as PdfFile));
    return onSnapshot(
      query(collection(db, "questions"), where("pdfId", "==", params.pdfId), where("userId", "==", dataOwnerId(appUser))),
      (snapshot) => {
        setQuestions(snapshot.docs.map((item) => item.data() as Question));
      },
      (error) => handleSnapshotError(error, "exam questions")
    );
  }, [appUser, params.pdfId]);

  useEffect(() => {
    if (!appUser || !pdf || !readyQuestions.length) return;
    const ownerId = dataOwnerId(appUser);
    const checkKey = `${ownerId}:${params.pdfId}`;
    if (draftCheckedFor === checkKey) return;
    const draft = readExamDraft(ownerId, params.pdfId);
    if (draft) setSettings(draft.settings);
    setDraftCheckedFor(checkKey);
  }, [appUser, draftCheckedFor, params.pdfId, pdf, readyQuestions.length]);

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
      shuffleChoices: form.get("shuffleChoices") === "on",
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
          <ExamRunner allQuestions={questions} settings={settings} onDiscard={() => setSettings(null)} />
        ) : !readyQuestions.length ? (
          <Card className="text-sm text-slate-600">
            <p>No ready questions are available for this PDF yet.</p>
            {reviewCount ? <p className="mt-2">{reviewCount} questions need review before they can appear in a mock test.</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild><Link href={`/pdfs/${params.pdfId}`}>Review questions</Link></Button>
              <Button variant="secondary" asChild><Link href="/upload">Back to PDFs</Link></Button>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="mb-5 grid gap-2 text-sm sm:grid-cols-3">
              <span className="rounded-lg bg-slate-50 px-3 py-2"><b className="block text-ink">{questions.length}</b>Total extracted</span>
              <span className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700"><b className="block">{readyQuestions.length}</b>Ready for exam</span>
              <span className="rounded-lg bg-amber-50 px-3 py-2 text-amber-700"><b className="block">{reviewCount}</b>Needs review</span>
            </div>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={start}>
              <Field label="From question"><Input name="fromQuestion" type="number" min={1} defaultValue={1} /></Field>
              <Field label="To question"><Input name="toQuestion" type="number" min={1} defaultValue={maxQuestion} /></Field>
              <Field label="Number of questions"><Input name="questionCount" type="number" min={1} max={readyQuestions.length} defaultValue={Math.min(30, readyQuestions.length)} /></Field>
              <Field label="Order"><Select name="order" defaultValue="random"><option value="random">Random</option><option value="sequential">Sequential</option></Select></Field>
              <Field label="Optional timer minutes"><Input name="timerMinutes" type="number" min={0} placeholder="No timer" /></Field>
              <Field label="Marks per correct"><Input name="marksPerCorrect" type="number" min={1} defaultValue={1} /></Field>
              <label className="flex min-h-11 items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm font-semibold"><input name="shuffleChoices" type="checkbox" defaultChecked /> Shuffle answer choices</label>
              <label className="flex min-h-11 items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm font-semibold"><input name="negativeMarks" type="checkbox" /> Enable negative marks</label>
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
