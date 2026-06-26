"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { doc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { Flag, Timer } from "lucide-react";
import { db } from "@/lib/firebase";
import { buildExamQuestions, scoreExam } from "@/lib/exam";
import { getDisplayOptions } from "@/lib/question-options";
import { useAuth } from "@/components/AuthProvider";
import { QuestionDiagrams } from "@/components/QuestionDiagrams";
import { ReprocessPdfButton } from "@/components/ReprocessPdfButton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ExamSettings, Question } from "@/types/models";

export function ExamRunner({ allQuestions, settings }: { allQuestions: Question[]; settings: ExamSettings }) {
  const router = useRouter();
  const { appUser } = useAuth();
  const questions = useMemo(() => buildExamQuestions(allQuestions, settings), [allQuestions, settings]);
  const optionOrderByQuestion = useMemo(() => {
    const shuffleChoices = settings.shuffleChoices !== false;
    return Object.fromEntries(questions.map((item) => [item.id, getDisplayOptions(item, shuffleChoices)]));
  }, [questions, settings.shuffleChoices]);
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
  const displayOptions = question ? optionOrderByQuestion[question.id] || getDisplayOptions(question, settings.shuffleChoices !== false) : [];
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
        displayOptionsByQuestion: optionOrderByQuestion,
        timeTaken: Math.round((Date.now() - startedAt) / 1000)
      })
    };
    await setDoc(doc(db, "examResults", resultId), result);
    router.push(`/exam/result/${resultId}`);
  }

  if (!question) {
    return (
      <Card className="text-sm text-slate-600">
        <p>No ready questions matched this setup. Widen the question range, review pending questions, or reprocess this PDF.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild><Link href={`/pdfs/${settings.pdfId}`}>Review questions</Link></Button>
          <ReprocessPdfButton pdfId={settings.pdfId} />
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Card className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="rounded-lg bg-aqua/10 px-3 py-1 text-sm font-semibold text-aqua">Question {current + 1} of {questions.length}</span>
          {settings.timerMinutes ? <span className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-1 text-sm font-semibold text-red-700"><Timer className="h-4 w-4" /> {time}</span> : null}
        </div>
        <p className="mt-6 break-words text-base font-semibold leading-7 sm:text-lg sm:leading-8">{question.questionText}</p>
        <QuestionDiagrams question={question} className="mt-5" />
        <div className="mt-5 grid gap-3">
          {displayOptions.map((option) => (
            <button
              key={option.displayKey}
              className={`min-h-12 rounded-lg border p-4 text-left text-sm leading-6 transition ${selected[question.id] === option.optionKey ? "border-aqua bg-aqua/10" : "border-slate-200 bg-white hover:border-aqua/50"}`}
              onClick={() => setSelected((answers) => ({ ...answers, [question.id]: option.optionKey }))}
            >
              <span className="font-bold">{option.displayKey}.</span> {option.text}
            </button>
          ))}
        </div>
        <div className="mt-6 grid gap-2 sm:flex sm:flex-wrap">
          <Button className="w-full sm:w-auto" variant="secondary" disabled={current === 0} onClick={() => setCurrent(current - 1)}>Previous</Button>
          <Button className="w-full sm:w-auto" disabled={current >= questions.length - 1} onClick={() => setCurrent(current + 1)}>Next</Button>
          <Button className="w-full sm:w-auto" variant="secondary" onClick={() => setMarked((items) => ({ ...items, [question.id]: !items[question.id] }))}>
            <Flag className="h-4 w-4" /> Mark for review
          </Button>
          <Button className="w-full sm:ml-auto sm:w-auto" onClick={() => submit(false)}>Submit exam</Button>
        </div>
      </Card>
      <Card className="h-fit lg:sticky lg:top-6">
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
