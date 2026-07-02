"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Flag, Loader2, RotateCcw, Timer, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { dataOwnerId } from "@/lib/account";
import { clearExamDraft, readExamDraft, saveExamDraft } from "@/lib/exam-draft";
import { buildExamQuestions, scoreExam } from "@/lib/exam";
import { submitExamResult } from "@/lib/exam-results-client";
import { getDisplayOptions } from "@/lib/question-options";
import { useAuth } from "@/components/AuthProvider";
import { QuestionDiagrams } from "@/components/QuestionDiagrams";
import { ReprocessPdfButton } from "@/components/ReprocessPdfButton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ExamSettings, Question } from "@/types/models";

export function ExamRunner({
  allQuestions,
  settings,
  onDiscard
}: {
  allQuestions: Question[];
  settings: ExamSettings;
  onDiscard?: () => void;
}) {
  const router = useRouter();
  const { appUser } = useAuth();
  const ownerId = appUser ? dataOwnerId(appUser) : "";
  const [initialDraft] = useState(() => readExamDraft(ownerId, settings.pdfId));
  const questions = useMemo(() => {
    if (!initialDraft?.questionIds.length) return buildExamQuestions(allQuestions, settings);
    const questionsById = new Map(allQuestions.map((question) => [question.id, question]));
    const restored = initialDraft.questionIds.map((id) => questionsById.get(id)).filter((item): item is Question => Boolean(item));
    return restored.length ? restored : buildExamQuestions(allQuestions, settings);
  }, [allQuestions, initialDraft, settings]);
  const optionOrderByQuestion = useMemo(() => {
    const shuffleChoices = settings.shuffleChoices !== false;
    return Object.fromEntries(questions.map((item) => {
      const storedOrder = initialDraft?.optionOrderByQuestion[item.id];
      if (storedOrder?.length) {
        const optionsByKey = new Map<string, ReturnType<typeof getDisplayOptions>[number]>(
          getDisplayOptions(item, false).map((option) => [option.optionKey, option])
        );
        const restored = storedOrder.map((key) => optionsByKey.get(key)).filter((option): option is NonNullable<typeof option> => Boolean(option));
        if (restored.length === optionsByKey.size) {
          return [item.id, restored.map((option, index) => ({ ...option, displayKey: String.fromCharCode(65 + index) }))];
        }
      }
      return [item.id, getDisplayOptions(item, shuffleChoices)];
    }));
  }, [initialDraft, questions, settings.shuffleChoices]);
  const [current, setCurrent] = useState(() => {
    const restoredIndex = initialDraft?.currentQuestionId
      ? questions.findIndex((question) => question.id === initialDraft.currentQuestionId)
      : -1;
    return restoredIndex >= 0 ? restoredIndex : 0;
  });
  const [selected, setSelected] = useState<Record<string, string>>(() => initialDraft?.selected || {});
  const [marked, setMarked] = useState<Record<string, boolean>>(() => initialDraft?.marked || {});
  const [startedAt] = useState(() => initialDraft?.startedAt || Date.now());
  const [resultId] = useState(() => initialDraft?.resultId || crypto.randomUUID());
  const [remaining, setRemaining] = useState(() => remainingSeconds(settings.timerMinutes, initialDraft?.startedAt || Date.now()));
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const selectedRef = useRef(selected);
  const markedRef = useRef(marked);
  const submittingRef = useRef(false);
  const submissionCompleteRef = useRef(false);
  const autoSubmitStartedRef = useRef(false);
  const submitRef = useRef<(auto?: boolean) => Promise<void>>(async () => undefined);

  useEffect(() => {
    if (!ownerId || !questions.length || submissionCompleteRef.current) return;
    const saveTimer = window.setTimeout(() => {
      saveExamDraft({
        resultId,
        ownerId,
        pdfId: settings.pdfId,
        settings,
        questionIds: questions.map((item) => item.id),
        currentQuestionId: questions[current]?.id,
        optionOrderByQuestion: Object.fromEntries(
          Object.entries(optionOrderByQuestion).map(([questionId, options]) => [questionId, options.map((option) => option.optionKey)])
        ),
        selected,
        marked,
        startedAt
      });
    }, 100);
    return () => window.clearTimeout(saveTimer);
  }, [current, marked, optionOrderByQuestion, ownerId, questions, resultId, selected, settings, startedAt]);

  useEffect(() => {
    submitRef.current = submit;
  });

  useEffect(() => {
    if (!settings.timerMinutes) return;
    const tick = () => {
      const next = remainingSeconds(settings.timerMinutes, startedAt);
      setRemaining(next);
      if (next === 0 && !autoSubmitStartedRef.current) {
        autoSubmitStartedRef.current = true;
        void submitRef.current(true);
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [settings.timerMinutes, startedAt]);

  const question = questions[current];
  const displayOptions = question ? optionOrderByQuestion[question.id] || getDisplayOptions(question, settings.shuffleChoices !== false) : [];
  const time = `${Math.floor(remaining / 60).toString().padStart(2, "0")}:${(remaining % 60).toString().padStart(2, "0")}`;

  async function submit(auto = false) {
    if (!appUser || !questions.length || submittingRef.current) return;
    if (!auto && !window.confirm("Submit this exam now?")) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmissionError("");
    const result = {
      resultId,
      date: new Date().toISOString(),
      ...scoreExam({
        userId: ownerId,
        questions,
        selected: selectedRef.current,
        marked: markedRef.current,
        settings,
        displayOptionsByQuestion: optionOrderByQuestion,
        timeTaken: Math.round((Date.now() - startedAt) / 1000)
      })
    };
    try {
      await submitExamResult(result);
      submissionCompleteRef.current = true;
      clearExamDraft(ownerId, settings.pdfId);
      toast.success("Mock test submitted.");
      router.push(`/exam/result/${resultId}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "The server did not accept the result.";
      setSubmissionError(`${detail} Your answers are saved on this device. Retry when your connection is stable.`);
      toast.error("Submission failed, but your answers are saved.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }
  function chooseAnswer(questionId: string, optionKey: string) {
    if (submitting) return;
    setSelected((answers) => {
      const next = { ...answers, [questionId]: optionKey };
      selectedRef.current = next;
      return next;
    });
  }

  function toggleMarked(questionId: string) {
    if (submitting) return;
    setMarked((items) => {
      const next = { ...items, [questionId]: !items[questionId] };
      markedRef.current = next;
      return next;
    });
  }

  function discardAttempt() {
    if (!window.confirm("Discard this saved attempt and return to test setup?")) return;
    submissionCompleteRef.current = true;
    clearExamDraft(ownerId, settings.pdfId);
    onDiscard?.();
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
        {initialDraft ? (
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-aqua/20 bg-aqua/5 px-3 py-2 text-sm font-semibold text-ink">
            <RotateCcw className="h-4 w-4 text-aqua" /> Saved attempt restored
          </div>
        ) : null}
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
              disabled={submitting}
              className={`min-h-12 rounded-lg border p-4 text-left text-sm leading-6 transition ${selected[question.id] === option.optionKey ? "border-aqua bg-aqua/10" : "border-slate-200 bg-white hover:border-aqua/50"}`}
              onClick={() => chooseAnswer(question.id, option.optionKey)}
            >
              <span className="font-bold">{option.displayKey}.</span> {option.text}
            </button>
          ))}
        </div>
        {submissionError ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{submissionError}</p>
            </div>
            <Button className="mt-3" variant="secondary" onClick={() => void submit(true)}>
              <RotateCcw className="h-4 w-4" /> Retry submission
            </Button>
          </div>
        ) : null}
        <div className="mt-6 grid gap-2 sm:flex sm:flex-wrap">
          <Button className="w-full sm:w-auto" variant="secondary" disabled={submitting || current === 0} onClick={() => setCurrent(current - 1)}>Previous</Button>
          <Button className="w-full sm:w-auto" disabled={submitting || current >= questions.length - 1} onClick={() => setCurrent(current + 1)}>Next</Button>
          <Button className="w-full sm:w-auto" variant="secondary" disabled={submitting} onClick={() => toggleMarked(question.id)}>
            <Flag className="h-4 w-4" /> Mark for review
          </Button>
          <Button className="w-full sm:ml-auto sm:w-auto" disabled={submitting} onClick={() => void submit(false)}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? "Submitting..." : "Submit exam"}
          </Button>
          <Button className="w-full sm:w-auto" variant="ghost" disabled={submitting} onClick={discardAttempt} aria-label="Discard saved attempt">
            <Trash2 className="h-4 w-4" /> Discard
          </Button>
        </div>
      </Card>
      <Card className="h-fit lg:sticky lg:top-6">
        <p className="font-semibold">Question Palette</p>
        <div className="mt-4 grid grid-cols-5 gap-2">
          {questions.map((item, index) => (
            <button
              key={item.id}
              disabled={submitting}
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

function remainingSeconds(timerMinutes: number | undefined, startedAt: number) {
  if (!timerMinutes) return 0;
  const total = timerMinutes * 60;
  return Math.max(0, total - Math.floor((Date.now() - startedAt) / 1000));
}
