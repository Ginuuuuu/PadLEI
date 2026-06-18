"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, doc, getDoc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { Bookmark, CheckCircle2, Search } from "lucide-react";
import toast from "react-hot-toast";
import { db } from "@/lib/firebase";
import { handleSnapshotError } from "@/lib/firestore-errors";
import { useAuth } from "@/components/AuthProvider";
import { ReprocessPdfButton } from "@/components/ReprocessPdfButton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getVisibleOptionKeys, isReadyQuestion } from "@/lib/question-options";
import type { Progress, Question } from "@/types/models";

export function StudyViewer({ pdfId }: { pdfId: string }) {
  const { appUser } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [queryText, setQueryText] = useState("");
  const [current, setCurrent] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    if (!appUser) return;
    return onSnapshot(
      query(collection(db, "questions"), where("pdfId", "==", pdfId), where("userId", "==", appUser.uid)),
      (snapshot) => {
        setQuestions(snapshot.docs.map((item) => item.data() as Question).sort((a, b) => a.questionNumber - b.questionNumber));
      },
      (error) => handleSnapshotError(error, "study questions")
    );
  }, [appUser, pdfId]);

  useEffect(() => {
    if (!appUser) return;
    const progressRef = doc(db, "progress", `${appUser.uid}_${pdfId}`);
    getDoc(progressRef).then((snapshot) => {
      setProgress(
        snapshot.exists()
          ? (snapshot.data() as Progress)
          : { userId: appUser.uid, pdfId, studiedQuestions: [], learnedQuestions: [], bookmarkedQuestions: [], weakQuestions: [], bestScore: 0, averageScore: 0 }
      );
    });
  }, [appUser, pdfId]);

  const filtered = useMemo(() => {
    const needle = queryText.trim().toLowerCase();
    const readyQuestions = questions.filter(isReadyQuestion);
    if (!needle) return readyQuestions;
    return readyQuestions.filter((question) => question.questionText.toLowerCase().includes(needle) || String(question.questionNumber) === needle);
  }, [questions, queryText]);

  const question = filtered[current];
  const readyCount = questions.filter((item) => item.status === "ready").length;
  const percent = readyCount && progress ? Math.min(100, Math.round((progress.studiedQuestions.length / readyCount) * 100)) : 0;

  async function patchProgress(patch: Partial<Progress>) {
    if (!appUser || !progress) return;
    const next = { ...progress, ...patch };
    setProgress(next);
    await setDoc(doc(db, "progress", `${appUser.uid}_${pdfId}`), next, { merge: true });
  }

  async function markStudied(kind: "studiedQuestions" | "learnedQuestions" | "bookmarkedQuestions") {
    if (!question || !progress) return;
    const list = new Set(progress[kind]);
    list.has(question.id) ? list.delete(question.id) : list.add(question.id);
    await patchProgress({ [kind]: [...list] });
    toast.success("Progress updated");
  }

  if (!question) {
    return (
      <Card className="text-sm text-slate-500">
        <p>No study-ready questions found. Review extraction, add missing answers, or paste a manual answer key.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ReprocessPdfButton pdfId={pdfId} />
          <Button asChild>
            <Link href={`/pdfs/${pdfId}`}>Review questions</Link>
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input className="pl-9" value={queryText} onChange={(event) => { setQueryText(event.target.value); setCurrent(0); }} placeholder="Search questions or enter question number" />
        </div>
        <Card>
          <div className="flex items-center justify-between">
            <span className="rounded-lg bg-aqua/10 px-3 py-1 text-sm font-semibold text-aqua">Question {question.questionNumber}</span>
            <span className="text-sm text-slate-500">{current + 1} / {filtered.length}</span>
          </div>
          <p className="mt-5 text-lg font-semibold leading-8">{question.questionText}</p>
          <div className="mt-5 grid gap-3">
            {getVisibleOptionKeys(question).map((key) => (
              <div key={key} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <span className="font-bold">{key}.</span> {question.options[key]}
              </div>
            ))}
          </div>
          {showAnswer ? (
            <div className="mt-5 rounded-lg bg-green-50 p-4 text-sm text-green-900">
              <p className="font-semibold">Correct answer: {question.correctAnswer}</p>
              {question.explanation ? <p className="mt-2">{question.explanation}</p> : null}
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => setShowAnswer((value) => !value)}>{showAnswer ? "Hide answer" : "Show answer"}</Button>
            <Button variant="secondary" onClick={() => markStudied("studiedQuestions")}>Mark studied</Button>
            <Button variant="secondary" onClick={() => markStudied("learnedQuestions")}><CheckCircle2 className="h-4 w-4" /> Learned</Button>
            <Button variant="secondary" onClick={() => markStudied("bookmarkedQuestions")}><Bookmark className="h-4 w-4" /> Bookmark</Button>
          </div>
        </Card>
        <div className="flex justify-between">
          <Button variant="secondary" disabled={current === 0} onClick={() => { setCurrent(current - 1); setShowAnswer(false); }}>Previous</Button>
          <Button disabled={current >= filtered.length - 1} onClick={() => { setCurrent(current + 1); setShowAnswer(false); }}>Next</Button>
        </div>
      </div>
      <Card className="h-fit">
        <p className="font-semibold">Progress</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-aqua" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-2 text-sm text-slate-500">{percent}% studied</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <Stat label="Learned" value={progress?.learnedQuestions.length || 0} />
          <Stat label="Bookmarked" value={progress?.bookmarkedQuestions.length || 0} />
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-slate-50 p-3"><p className="text-lg font-bold">{value}</p><p className="text-xs text-slate-500">{label}</p></div>;
}
