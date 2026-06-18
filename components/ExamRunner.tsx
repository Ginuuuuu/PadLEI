"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { Flag, Timer } from "lucide-react";
import { db } from "@/lib/firebase";
import { buildExamQuestions, scoreExam } from "@/lib/exam";
import { getVisibleOptionKeys } from "@/lib/question-options";
import { useAuth } from "@/components/AuthProvider";
import { ReprocessPdfButton } from "@/components/ReprocessPdfButton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ExamSettings, Question } from "@/types/models";

export function ExamRunner({ allQuestions, settings }: { allQuestions: Question[]; settings: ExamSettings }) {
  const router = useRouter();
  const { appUser } = useAuth();
  const questions = useMemo(() => buildExamQuestions(allQuestions, settings), [allQuestions, settings]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [startedAt] = useState(Date.now());
  const [remaining, setRemaining] = useState((settings.timerMinutes || 0) * 60);

  useEffect(() => {
    if (!settings.timerMinutes) return;
    const timer = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          submit(true);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [settings.timerMinutes]);

  const question = questions[current];
  const time = `${Math.floor(remaining / 60).toString().padStart(2, "0")}:${(remaining % 60).toString().padStart(2, "0")}`;

  async function submit(auto = false) {
    if (!appUser || !questions.length) return;
    if (!auto && !confirm("Submit this exam now?")) return;
    const resultId = crypto.randomUUID();
    const result = {
      resultId,
      date: new Date().toISOString(),
      ...scoreExam({
        userId: appUser.uid,
        questions,
        selected,
        marked,
        settings,
        timeTaken: Math.round((Date.now() - startedAt) / 1000)
      })
    };
    await setDoc(doc(db, "examResults", resultId), result);
    router.push(`/exam/result/${resultId}`);
  }

  if (!question) {
    return (
      <Card className="text-sm text-slate-600">
        <p>No ready questions matched this setup. Reprocess this PDF, or widen the question range.</p>
        <ReprocessPdfButton className="mt-4" pdfId={settings.pdfId} />
      </Card>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="rounded-lg bg-aqua/10 px-3 py-1 text-sm font-semibold text-aqua">Question {current + 1} of {questions.length}</span>
          {settings.timerMinutes ? <span className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-1 text-sm font-semibold text-red-700"><Timer className="h-4 w-4" /> {time}</span> : null}
        </div>
        <p className="mt-6 text-lg font-semibold leading-8">{question.questionText}</p>
        <div className="mt-5 grid gap-3">
          {getVisibleOptionKeys(question).map((key) => (
            <button
              key={key}
              className={`rounded-lg border p-4 text-left text-sm transition ${selected[question.id] === key ? "border-aqua bg-aqua/10" : "border-slate-200 bg-white hover:border-aqua/50"}`}
              onClick={() => setSelected((answers) => ({ ...answers, [question.id]: key }))}
            >
              <span className="font-bold">{key}.</span> {question.options[key]}
            </button>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="secondary" disabled={current === 0} onClick={() => setCurrent(current - 1)}>Previous</Button>
          <Button disabled={current >= questions.length - 1} onClick={() => setCurrent(current + 1)}>Next</Button>
          <Button variant="secondary" onClick={() => setMarked((items) => ({ ...items, [question.id]: !items[question.id] }))}>
            <Flag className="h-4 w-4" /> Mark for review
          </Button>
          <Button className="ml-auto" onClick={() => submit(false)}>Submit exam</Button>
        </div>
      </Card>
      <Card className="h-fit">
        <p className="font-semibold">Question Palette</p>
        <div className="mt-4 grid grid-cols-5 gap-2">
          {questions.map((item, index) => (
            <button
              key={item.id}
              className={`h-10 rounded-lg text-sm font-semibold ${index === current ? "bg-ink text-white" : marked[item.id] ? "bg-amber-100 text-amber-800" : selected[item.id] ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}
              onClick={() => setCurrent(index)}
            >
              {index + 1}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
