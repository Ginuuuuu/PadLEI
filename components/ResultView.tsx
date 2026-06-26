"use client";

import Link from "next/link";
import { Award, Download, RotateCcw } from "lucide-react";
import { gradeFromPercentage } from "@/lib/exam";
import { QuestionDiagrams } from "@/components/QuestionDiagrams";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ExamAnswer, ExamResult, Question } from "@/types/models";

export function ResultView({ result }: { result: ExamResult }) {
  return (
    <div className="space-y-5">
      <Card className="bg-gradient-to-br from-white to-green-50">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">{result.pdfName}</p>
            <h2 className="mt-1 text-3xl font-bold">{result.percentage}%</h2>
            <p className="mt-1 inline-flex items-center gap-2 font-semibold text-leaf"><Award className="h-4 w-4" /> {gradeFromPercentage(result.percentage)}</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
            <Button className="w-full" variant="secondary" asChild><Link href={`/exam/${result.pdfId}`}><RotateCcw className="h-4 w-4" /> Retake</Link></Button>
            <Button className="w-full" variant="secondary" onClick={() => window.print()}><Download className="h-4 w-4" /> PDF</Button>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total" value={result.totalQuestions} />
        <Metric label="Correct" value={result.correct} />
        <Metric label="Wrong" value={result.wrong} />
        <Metric label="Marks" value={result.marks} />
        <Metric label="Unattempted" value={result.unattempted} />
        <Metric label="Attempted" value={result.attempted} />
        <Metric label="Time taken" value={`${Math.round(result.timeTaken / 60)} min`} />
        <Metric label="Status" value={gradeFromPercentage(result.percentage)} />
      </div>
      <div className="space-y-4">
        {result.questions.map((question, index) => {
          const answer = result.answers.find((item) => item.questionId === question.id);
          const status = !answer?.selectedAnswer ? "Unattempted" : answer.isCorrect ? "Correct" : "Wrong";
          const selectedDetail = getSelectedAnswerDetail(question, answer);
          const correctDetail = getCorrectAnswerDetail(question, answer);
          return (
            <Card key={question.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <h3 className="break-words font-semibold leading-7">Q{index + 1}. {question.questionText}</h3>
                <span className={`rounded-lg px-3 py-1 text-xs font-semibold ${status === "Correct" ? "bg-green-100 text-green-800" : status === "Wrong" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600"}`}>{status}</span>
              </div>
              <QuestionDiagrams question={question} className="mt-4" />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <AnswerReview
                  title="Your answer"
                  detail={selectedDetail}
                  tone={!answer?.selectedAnswer ? "neutral" : answer.isCorrect ? "correct" : "wrong"}
                />
                <AnswerReview title="Correct answer" detail={correctDetail} tone="correct" />
              </div>
              {question.explanation ? <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{question.explanation}</p> : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <Card><p className="text-2xl font-bold">{value}</p><p className="text-sm text-slate-500">{label}</p></Card>;
}

type AnswerDetail = {
  label: string;
  text: string;
  empty?: boolean;
};

type AnswerTone = "correct" | "wrong" | "neutral";

function AnswerReview({ title, detail, tone }: { title: string; detail: AnswerDetail; tone: AnswerTone }) {
  const toneClass = {
    correct: "border-green-100 bg-green-50",
    wrong: "border-red-100 bg-red-50",
    neutral: "border-slate-200 bg-slate-50"
  }[tone];
  const labelClass = {
    correct: "text-green-800",
    wrong: "text-red-800",
    neutral: "text-slate-700"
  }[tone];

  return (
    <div className={`min-w-0 rounded-lg border p-3 ${toneClass}`}>
      <p className="text-xs font-semibold text-slate-500">{title}</p>
      <p className={`mt-1 break-words text-sm font-bold ${labelClass}`}>{detail.label}</p>
      {detail.text ? <p className="mt-1 break-words text-sm leading-6 text-slate-700">{detail.text}</p> : null}
      {!detail.text && !detail.empty ? <p className="mt-1 text-sm text-slate-500">Answer text unavailable</p> : null}
    </div>
  );
}

function getSelectedAnswerDetail(question: Question, answer?: ExamAnswer): AnswerDetail {
  if (!answer?.selectedAnswer) {
    return { label: "Not answered", text: "", empty: true };
  }

  return {
    label: answer.selectedDisplayAnswer || answer.selectedAnswer,
    text: answer.selectedAnswerText || optionText(question, answer.selectedAnswer)
  };
}

function getCorrectAnswerDetail(question: Question, answer?: ExamAnswer): AnswerDetail {
  const correctAnswer = answer?.correctAnswer || question.correctAnswer || "";

  return {
    label: answer?.correctDisplayAnswer || correctAnswer || "Missing",
    text: answer?.correctAnswerText || optionText(question, correctAnswer)
  };
}

function optionText(question: Question, optionKey: string) {
  if (!optionKey) return "";
  return question.options?.[optionKey as keyof Question["options"]]?.trim() || "";
}
