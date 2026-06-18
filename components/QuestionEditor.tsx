"use client";

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, setDoc, updateDoc, where } from "firebase/firestore";
import toast from "react-hot-toast";
import { db } from "@/lib/firebase";
import { handleSnapshotError } from "@/lib/firestore-errors";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { extractAnswerKey } from "@/lib/extraction";
import { optionKeys, questionStatus } from "@/lib/question-options";
import type { Question } from "@/types/models";

export function QuestionEditor({ pdfId }: { pdfId: string }) {
  const { appUser } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answerKeyText, setAnswerKeyText] = useState("");

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

  async function save(question: Question) {
    const status = questionStatus(question);
    await updateDoc(doc(db, "questions", question.id), { ...question, status });
    toast.success("Question updated");
  }

  async function addQuestion() {
    if (!appUser) return;
    const id = crypto.randomUUID();
    const nextNumber = Math.max(0, ...questions.map((question) => question.questionNumber)) + 1;
    await setDoc(doc(db, "questions", id), {
      id,
      pdfId,
      userId: appUser.uid,
      questionNumber: nextNumber,
      questionText: "",
      options: { A: "", B: "", C: "", D: "", E: "", F: "" },
      correctAnswer: "",
      explanation: "",
      status: "needs_review",
      extractionNote: "Added manually."
    } satisfies Question);
    toast.success("Manual question added");
  }

  async function applyAnswerKey() {
    const answers = extractAnswerKey(answerKeyText);
    if (!answers.size) {
      toast.error("No answers found. Try formats like: 1 A, 2 B, 3-C");
      return;
    }

    const updates = questions
      .map((question) => {
        const answer = answers.get(question.questionNumber);
        if (!answer) return null;
        const status = questionStatus({ ...question, correctAnswer: answer });
        return updateDoc(doc(db, "questions", question.id), {
          correctAnswer: answer,
          status,
          extractionNote: "Answer added manually from answer key."
        });
      })
      .filter(Boolean);

    await Promise.all(updates);
    setAnswerKeyText("");
    toast.success(`Applied ${updates.length} answers`);
  }

  if (!questions.length) {
    return (
      <Card className="text-sm text-slate-500">
        <p>No extracted questions are available. Add questions manually, or re-upload a clearer/text-based PDF.</p>
        <Button className="mt-4" onClick={addQuestion}>Add question manually</Button>
      </Card>
    );
  }

  const missingAnswers = questions.filter((question) => !question.correctAnswer).length;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">Manual Answer Key</h2>
            <p className="mt-1 text-sm text-slate-500">
              {missingAnswers} questions need answers. Paste an answer key if the PDF has no answers or extraction missed highlighted answers.
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
        <Button className="mt-3" onClick={applyAnswerKey}>Apply answers</Button>
        <Button className="ml-2 mt-3" variant="secondary" onClick={addQuestion}>Add question manually</Button>
      </Card>
      {questions.map((question, index) => (
        <Card key={question.id} className={question.status === "needs_review" ? "border-amber-300" : ""}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <Input className="max-w-28" type="number" value={question.questionNumber} onChange={(event) => updateLocal(index, { questionNumber: Number(event.target.value) })} />
            <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs">{question.status}</span>
          </div>
          {question.extractionNote ? <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{question.extractionNote}</p> : null}
          <Textarea value={question.questionText} onChange={(event) => updateLocal(index, { questionText: event.target.value })} />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {optionKeys.map((key) => (
              <Input key={key} value={question.options[key]} placeholder={`Option ${key}`} onChange={(event) => updateLocal(index, { options: { ...question.options, [key]: event.target.value } })} />
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Select value={question.correctAnswer} onChange={(event) => updateLocal(index, { correctAnswer: event.target.value as Question["correctAnswer"] })}>
              <option value="">Correct answer</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
              <option value="E">E</option>
              <option value="F">F</option>
            </Select>
            <Input value={question.explanation || ""} placeholder="Explanation" onChange={(event) => updateLocal(index, { explanation: event.target.value })} />
          </div>
          <Button className="mt-4" onClick={() => save(question)}>Save question</Button>
        </Card>
      ))}
    </div>
  );

  function updateLocal(index: number, patch: Partial<Question>) {
    setQuestions((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }
}
