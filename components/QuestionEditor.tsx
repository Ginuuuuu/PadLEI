"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc, where } from "firebase/firestore";
import { CheckCircle2, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { db } from "@/lib/firebase";
import { handleSnapshotError } from "@/lib/firestore-errors";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { extractAnswerKey } from "@/lib/extraction";
import { isNeedsReviewStatus, optionKeys, questionCounts, questionStatus } from "@/lib/question-options";
import type { Question } from "@/types/models";

export function QuestionEditor({ pdfId }: { pdfId: string }) {
  const { appUser } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answerKeyText, setAnswerKeyText] = useState("");
  const [tab, setTab] = useState<"review" | "all">("review");

  useEffect(() => {
    if (!appUser) return;
    return onSnapshot(
      query(collection(db, "questions"), where("pdfId", "==", pdfId), where("userId", "==", appUser.uid)),
      (snapshot) => {
        setQuestions(snapshot.docs.map((item) => item.data() as Question).sort((a, b) => a.questionNumber - b.questionNumber));
      },
      (error) => handleSnapshotError(error, "questions")
    );
  }, [appUser, pdfId]);

  const counts = useMemo(() => questionCounts(questions), [questions]);
  const visibleQuestions = tab === "review" ? questions.filter((question) => isNeedsReviewStatus(question.status)) : questions;
  const missingAnswers = questions.filter((question) => !question.correctAnswer).length;

  async function refreshPdfCounts(nextQuestions: Question[]) {
    const nextCounts = questionCounts(nextQuestions);
    await updateDoc(doc(db, "pdfs", pdfId), {
      totalQuestions: nextQuestions.length,
      readyQuestions: nextCounts.readyQuestions,
      needsReviewQuestions: nextCounts.needsReviewQuestions,
      errorMessage: nextCounts.needsReviewQuestions ? `${nextCounts.needsReviewQuestions} questions need review before exam.` : ""
    }).catch(() => undefined);
  }

  async function save(question: Question) {
    const status = questionStatus(question);
    const payload = {
      ...question,
      questionId: question.questionId || question.id,
      status,
      confidence: status === "ready" ? Math.max(question.confidence || 0, 0.9) : question.confidence || 0.45,
      extractionNote: status === "ready" ? "Reviewed and marked ready." : question.extractionNote || "Needs review."
    };
    await updateDoc(doc(db, "questions", question.id), payload);
    await refreshPdfCounts(questions.map((item) => (item.id === question.id ? payload : item)));
    toast.success(status === "ready" ? "Question saved and moved to ready" : "Question saved");
  }

  async function markReady(question: Question) {
    const status = questionStatus(question);
    if (status !== "ready") {
      toast.error("Add question text, at least two options, and a correct answer first.");
      return;
    }
    const payload = { ...question, status: "ready" as const, confidence: Math.max(question.confidence || 0, 0.95), extractionNote: "Reviewed and marked ready." };
    await updateDoc(doc(db, "questions", question.id), payload);
    await refreshPdfCounts(questions.map((item) => (item.id === question.id ? payload : item)));
    toast.success("Question marked ready");
  }

  async function deleteQuestion(question: Question) {
    if (!confirm(`Delete question ${question.questionNumber}?`)) return;
    await deleteDoc(doc(db, "questions", question.id));
    await refreshPdfCounts(questions.filter((item) => item.id !== question.id));
    toast.success("Question deleted");
  }

  async function addQuestion() {
    if (!appUser) return;
    const id = crypto.randomUUID();
    const nextNumber = Math.max(0, ...questions.map((question) => question.questionNumber)) + 1;
    const question = {
      id,
      questionId: id,
      pdfId,
      userId: appUser.uid,
      questionNumber: nextNumber,
      questionText: "",
      options: { A: "", B: "", C: "", D: "", E: "", F: "" },
      correctAnswer: "",
      explanation: "",
      status: "needsReview",
      confidence: 0,
      extractionNote: "Added manually."
    } satisfies Question;
    await setDoc(doc(db, "questions", id), question);
    await refreshPdfCounts([...questions, question]);
    setTab("review");
    toast.success("Manual question added");
  }

  async function applyAnswerKey() {
    const answers = extractAnswerKey(answerKeyText);
    if (!answers.size) {
      toast.error("No answers found. Try formats like: 1 A, 2 B, 3-C");
      return;
    }

    const nextQuestions = questions.map((question) => {
      const answer = answers.get(question.questionNumber);
      if (!answer) return question;
      const next = { ...question, correctAnswer: answer };
      return { ...next, status: questionStatus(next), confidence: questionStatus(next) === "ready" ? Math.max(next.confidence || 0, 0.88) : next.confidence || 0.45 };
    });

    await Promise.all(
      nextQuestions
        .filter((question, index) => question !== questions[index])
        .map((question) =>
          updateDoc(doc(db, "questions", question.id), {
            correctAnswer: question.correctAnswer,
            status: question.status,
            confidence: question.confidence,
            extractionNote: "Answer added manually from answer key."
          })
        )
    );
    await refreshPdfCounts(nextQuestions);
    setAnswerKeyText("");
    toast.success("Answer key applied");
  }

  if (!questions.length) {
    return (
      <Card className="text-sm text-slate-500">
        <p>No extracted questions are available. Add questions manually, or re-upload a clearer/text-based PDF.</p>
        <Button className="mt-4" onClick={addQuestion}>Add question manually</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">{counts.needsReviewQuestions} questions need review</h2>
            <p className="mt-1 text-sm text-slate-500">
              Ready questions are already available in Study and Exam. Fix only uncertain questions here.
            </p>
          </div>
          <div className="flex rounded-lg border border-slate-200 bg-white p-1">
            <button className={`rounded-md px-3 py-2 text-sm font-semibold ${tab === "review" ? "bg-ink text-white" : "text-slate-600"}`} onClick={() => setTab("review")}>Needs Review</button>
            <button className={`rounded-md px-3 py-2 text-sm font-semibold ${tab === "all" ? "bg-ink text-white" : "text-slate-600"}`} onClick={() => setTab("all")}>All Questions</button>
          </div>
        </div>
      </Card>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">Manual Answer Key</h2>
            <p className="mt-1 text-sm text-slate-500">
              {missingAnswers} questions need answers. Paste an answer key if the PDF has no answers or extraction missed marked answers.
            </p>
          </div>
          <span className="rounded-lg bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Review before exam</span>
        </div>
        <Textarea
          className="mt-4"
          value={answerKeyText}
          onChange={(event) => setAnswerKeyText(event.target.value)}
          placeholder={"Paste answers like:\n1 A\n2 C\n3-D\n4: B"}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={applyAnswerKey}>Apply answers</Button>
          <Button variant="secondary" onClick={addQuestion}>Add question manually</Button>
        </div>
      </Card>
      <div className="space-y-4">
        {visibleQuestions.map((question, index) => (
          <Card key={question.id} className={isNeedsReviewStatus(question.status) ? "border-amber-300" : ""}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <Input className="max-w-28" type="number" value={question.questionNumber} onChange={(event) => updateLocal(question.id, { questionNumber: Number(event.target.value) })} />
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs">{question.status}</span>
                <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs">{Math.round((question.confidence || 0) * 100)}% confidence</span>
              </div>
            </div>
            {question.extractionNote ? <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{question.extractionNote}</p> : null}
            <Textarea value={question.questionText} onChange={(event) => updateLocal(question.id, { questionText: event.target.value })} />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {optionKeys.map((key) => (
                <Input key={key} value={question.options[key] || ""} placeholder={`Option ${key}`} onChange={(event) => updateLocal(question.id, { options: { ...question.options, [key]: event.target.value } })} />
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Select value={question.correctAnswer} onChange={(event) => updateLocal(question.id, { correctAnswer: event.target.value as Question["correctAnswer"] })}>
                <option value="">Correct answer</option>
                {optionKeys.map((key) => <option key={key} value={key}>{key}</option>)}
              </Select>
              <Input value={question.explanation || ""} placeholder="Explanation" onChange={(event) => updateLocal(question.id, { explanation: event.target.value })} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => save(question)}>Save Question</Button>
              <Button variant="secondary" onClick={() => markReady(question)}><CheckCircle2 className="h-4 w-4" /> Mark as Ready</Button>
              <Button variant="danger" onClick={() => deleteQuestion(question)}><Trash2 className="h-4 w-4" /> Delete Question</Button>
            </div>
          </Card>
        ))}
        {!visibleQuestions.length ? (
          <Card className="text-center text-sm text-slate-500">
            No questions need review. Ready questions are available for Study and Exam.
          </Card>
        ) : null}
      </div>
    </div>
  );

  function updateLocal(id: string, patch: Partial<Question>) {
    setQuestions((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }
}
