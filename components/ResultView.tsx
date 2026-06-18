"use client";

import Link from "next/link";
import { Award, Download, RotateCcw } from "lucide-react";
import { gradeFromPercentage } from "@/lib/exam";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ExamResult } from "@/types/models";

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
          <div className="flex gap-2">
            <Button variant="secondary" asChild><Link href={`/exam/${result.pdfId}`}><RotateCcw className="h-4 w-4" /> Retake</Link></Button>
            <Button variant="secondary" onClick={() => window.print()}><Download className="h-4 w-4" /> PDF</Button>
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
          return (
            <Card key={question.id}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">Q{index + 1}. {question.questionText}</h3>
                <span className={`rounded-lg px-3 py-1 text-xs font-semibold ${status === "Correct" ? "bg-green-100 text-green-800" : status === "Wrong" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600"}`}>{status}</span>
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <p>Your answer: <b>{answer?.selectedAnswer || "Not answered"}</b></p>
                <p>Correct answer: <b>{question.correctAnswer}</b></p>
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
