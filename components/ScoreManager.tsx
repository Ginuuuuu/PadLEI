"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { BarChart3, Pencil, Plus, Search, Trash2, TrendingDown, TrendingUp, X } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { dataOwnerId } from "@/lib/account";
import { academicSummary, calculatePercentage, examTypePresets, validateScore } from "@/lib/academic";
import { db } from "@/lib/firebase";
import { handleSnapshotError } from "@/lib/firestore-errors";
import { useAcademicCatalog } from "@/lib/use-academic-catalog";
import type { ActualExamScore, ExamResult, Semester, Subject } from "@/types/models";

export function ScoreManager({ summary = false }: { summary?: boolean }) {
  const { appUser } = useAuth();
  const { semesters, subjects, addSubject } = useAcademicCatalog();
  const [scores, setScores] = useState<ActualExamScore[]>([]);
  const [mockResults, setMockResults] = useState<ExamResult[]>([]);
  const [editing, setEditing] = useState<ActualExamScore | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [semesterFilter, setSemesterFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [examFilter, setExamFilter] = useState("all");

  useEffect(() => {
    if (!appUser) return;
    const ownerId = dataOwnerId(appUser);
    const unsubscribeScores = onSnapshot(
      query(collection(db, "actualExamScores"), where("userId", "==", ownerId)),
      (snapshot) => setScores(snapshot.docs.map((item) => item.data() as ActualExamScore)),
      (error) => handleSnapshotError(error, "actual AVN scores")
    );
    const unsubscribeMocks = onSnapshot(
      query(collection(db, "examResults"), where("userId", "==", ownerId)),
      (snapshot) => setMockResults(snapshot.docs.map((item) => item.data() as ExamResult)),
      (error) => handleSnapshotError(error, "mock-test comparison")
    );
    return () => {
      unsubscribeScores();
      unsubscribeMocks();
    };
  }, [appUser]);

  const summaryData = useMemo(() => academicSummary(scores, mockResults), [mockResults, scores]);
  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return scores
      .filter((score) => !needle || [score.subjectName, score.examName, score.semesterName].some((value) => value.toLocaleLowerCase().includes(needle)))
      .filter((score) => semesterFilter === "all" || score.semesterId === semesterFilter)
      .filter((score) => subjectFilter === "all" || score.subjectId === subjectFilter)
      .filter((score) => examFilter === "all" || score.examName === examFilter)
      .sort((a, b) => b.examDate.localeCompare(a.examDate));
  }, [examFilter, scores, search, semesterFilter, subjectFilter]);

  if (summary) {
    const recent = [...scores].sort((a, b) => b.examDate.localeCompare(a.examDate))[0];
    return (
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-500">Academic performance</p>
            <p className="mt-1 text-3xl font-bold">{summaryData.overallAverage || 0}%</p>
          </div>
          <BarChart3 className="h-6 w-6 text-berry" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><p className="font-bold">{summaryData.mockAverage || 0}%</p><p className="text-slate-500">Mock average</p></div>
          <div><p className="font-bold">{summaryData.actualAverage || 0}%</p><p className="text-slate-500">Actual AVN</p></div>
        </div>
        <p className="mt-4 text-sm text-slate-500">{recent ? `Recent: ${recent.subjectName} ${recent.examName} - ${recent.percentage}%` : "Add an actual AVN score to begin comparing performance."}</p>
      </Card>
    );
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PerformanceCard label="Overall academic" value={summaryData.overallAverage} />
        <PerformanceCard label="Actual AVN average" value={summaryData.actualAverage} />
        <PerformanceCard label="Mock-test average" value={summaryData.mockAverage} />
        <PerformanceCard label="Recorded exams" value={scores.length} suffix="" />
      </div>

      {summaryData.subjects.length ? (
        <Card className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">Subject comparison</h2>
              <p className="mt-1 text-sm text-slate-500">Mock tests and actual AVNs shown together. Values are also written for accessibility.</p>
            </div>
            <BarChart3 className="h-5 w-5 text-aqua" />
          </div>
          <div className="mt-5 grid gap-4">
            {summaryData.subjects.slice(0, 8).map((subject) => (
              <div key={subject.subjectName}>
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span className="font-semibold">{subject.subjectName}</span>
                  <span>Mock {subject.mockAverage}% / Actual {subject.actualAverage}%</span>
                </div>
                <div className="mt-2 grid gap-1" role="img" aria-label={`${subject.subjectName}: mock ${subject.mockAverage} percent, actual ${subject.actualAverage} percent`}>
                  <div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-aqua" style={{ width: `${subject.mockAverage}%` }} /></div>
                  <div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-berry" style={{ width: `${subject.actualAverage}%` }} /></div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="mt-5 flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
            <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search scores" aria-label="Search scores" />
          </div>
          <Select value={semesterFilter} onChange={(event) => {
            setSemesterFilter(event.target.value);
            setSubjectFilter("all");
          }} aria-label="Filter scores by semester">
            <option value="all">All semesters</option>
            {semesters.map((semester) => <option key={semester.semesterId} value={semester.semesterId}>{semester.name}</option>)}
          </Select>
          <Select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} aria-label="Filter scores by subject">
            <option value="all">All subjects</option>
            {subjects.filter((subject) => semesterFilter === "all" || subject.semesterId === semesterFilter).map((subject) => <option key={`${subject.semesterId}_${subject.subjectId}`} value={subject.subjectId}>{subject.name}</option>)}
          </Select>
          <Select value={examFilter} onChange={(event) => setExamFilter(event.target.value)} aria-label="Filter scores by exam">
            <option value="all">All exams</option>
            {Array.from(new Set(scores.map((score) => score.examName))).sort().map((name) => <option key={name} value={name}>{name}</option>)}
          </Select>
        </div>
        <div className="flex justify-end"><Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add score</Button></div>
      </div>

      <div className="mt-5 hidden overflow-hidden rounded-lg border border-slate-200 bg-white lg:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Semester / Subject</th><th className="px-4 py-3">Exam</th><th className="px-4 py-3">Marks</th><th className="px-4 py-3">Percentage</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((score) => (
              <tr key={score.scoreId}>
                <td className="px-4 py-3">{score.examDate}</td>
                <td className="px-4 py-3"><p className="font-semibold">{score.subjectName}</p><p className="text-xs text-slate-500">{score.semesterName}</p></td>
                <td className="px-4 py-3">{score.examName}</td>
                <td className="px-4 py-3">{score.obtainedMarks} / {score.maximumMarks}</td>
                <td className="px-4 py-3 font-bold">{score.percentage}%</td>
                <td className="px-4 py-3"><ResultStatus status={score.status} /></td>
                <td className="px-4 py-3"><ScoreActions score={score} onEdit={() => setEditing(score)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5 grid gap-4 lg:hidden">
        {visible.map((score) => (
          <Card key={score.scoreId}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><h2 className="break-words font-bold">{score.subjectName} - {score.examName}</h2><p className="mt-1 text-sm text-slate-500">{score.semesterName} / {score.examDate}</p></div>
              <ResultStatus status={score.status} />
            </div>
            <p className="mt-4 text-2xl font-bold">{score.percentage}%</p>
            <p className="text-sm text-slate-500">{score.obtainedMarks} of {score.maximumMarks} marks / pass mark {score.passMark}</p>
            <div className="mt-4"><ScoreActions score={score} onEdit={() => setEditing(score)} /></div>
          </Card>
        ))}
      </div>
      {!visible.length ? <Card className="mt-5 text-center text-sm text-slate-500">No actual AVN scores match these filters.</Card> : null}

      {editing ? (
        <ScoreForm
          score={editing === "new" ? undefined : editing}
          ownerId={appUser ? dataOwnerId(appUser) : ""}
          semesters={semesters}
          subjects={subjects}
          onCreateSubject={addSubject}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function ScoreForm({
  score,
  ownerId,
  semesters,
  subjects,
  onCreateSubject,
  onClose
}: {
  score?: ActualExamScore;
  ownerId: string;
  semesters: Semester[];
  subjects: Subject[];
  onCreateSubject: (semester: Pick<Semester, "semesterId" | "name">, name: string, isCustom?: boolean) => Promise<Subject>;
  onClose: () => void;
}) {
  const [semesterId, setSemesterId] = useState(score?.semesterId || "uncategorized");
  const [subjectName, setSubjectName] = useState(score?.subjectName || "General");
  const [examName, setExamName] = useState(score?.examName || "AVN 1");
  const [busy, setBusy] = useState(false);
  const semester = semesters.find((item) => item.semesterId === semesterId) || semesters[0];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!semester) return;
    const form = new FormData(event.currentTarget);
    const obtainedMarks = Number(form.get("obtainedMarks"));
    const maximumMarks = Number(form.get("maximumMarks"));
    const passMark = Number(form.get("passMark"));
    const examDate = String(form.get("examDate") || "");
    const validation = validateScore({ obtainedMarks, maximumMarks, passMark, examDate });
    if (validation) return toast.error(validation);
    setBusy(true);
    try {
      const subject = await onCreateSubject(semester, subjectName);
      const now = new Date().toISOString();
      const scoreId = score?.scoreId || crypto.randomUUID();
      const percentage = calculatePercentage(obtainedMarks, maximumMarks);
      const grade = String(form.get("grade") || "").trim();
      const notes = String(form.get("notes") || "").trim().slice(0, 500);
      const record: ActualExamScore = {
        scoreId,
        userId: ownerId,
        semesterId: semester.semesterId,
        semesterName: semester.name,
        subjectId: subject.subjectId,
        subjectName: subject.name,
        examName: examName.trim(),
        examDate,
        obtainedMarks,
        maximumMarks,
        percentage,
        passMark,
        status: obtainedMarks >= passMark ? "pass" : "fail",
        ...(grade ? { grade } : {}),
        ...(notes ? { notes } : {}),
        createdAt: score?.createdAt || now,
        updatedAt: now
      };
      await setDoc(doc(db, "actualExamScores", scoreId), record);
      toast.success(score ? "Score updated" : "Score added");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save score.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/60 px-4 py-6" role="dialog" aria-modal="true">
      <Card className="mx-auto w-full max-w-2xl">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">{score ? "Edit actual AVN score" : "Add actual AVN score"}</h2><Button className="h-11 w-11 px-0" variant="ghost" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></Button></div>
        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <Field label="Semester"><Select value={semesterId} onChange={(event) => {
            setSemesterId(event.target.value);
            setSubjectName("General");
          }}>{semesters.map((item) => <option key={item.semesterId} value={item.semesterId}>{item.name}</option>)}</Select></Field>
          <Field label="Subject"><Input list="score-subjects" value={subjectName} onChange={(event) => setSubjectName(event.target.value)} maxLength={100} required /><datalist id="score-subjects">{subjects.filter((subject) => subject.semesterId === semesterId).map((subject) => <option key={subject.subjectId} value={subject.name} />)}</datalist></Field>
          <Field label="Exam name"><Input list="score-exam-names" value={examName} onChange={(event) => setExamName(event.target.value)} maxLength={60} required /><datalist id="score-exam-names">{examTypePresets.map((name) => <option key={name} value={name} />)}</datalist></Field>
          <Field label="Exam date"><Input name="examDate" type="date" defaultValue={score?.examDate} required /></Field>
          <Field label="Obtained marks"><Input name="obtainedMarks" type="number" min="0" step="0.01" defaultValue={score?.obtainedMarks} required /></Field>
          <Field label="Maximum marks"><Input name="maximumMarks" type="number" min="0.01" step="0.01" defaultValue={score?.maximumMarks} required /></Field>
          <Field label="Pass mark"><Input name="passMark" type="number" min="0" step="0.01" defaultValue={score?.passMark} required /></Field>
          <Field label="Grade, optional"><Input name="grade" maxLength={20} defaultValue={score?.grade} /></Field>
          <label className="block text-sm font-semibold sm:col-span-2">Notes, optional<Textarea className="mt-1" name="notes" maxLength={500} defaultValue={score?.notes} /></label>
          <div className="sm:col-span-2"><Button className="w-full" disabled={busy}>{busy ? "Saving..." : "Save score"}</Button></div>
        </form>
      </Card>
    </div>
  );
}

function ScoreActions({ score, onEdit }: { score: ActualExamScore; onEdit: () => void }) {
  return (
    <div className="flex gap-2">
      <Button variant="secondary" onClick={onEdit}><Pencil className="h-4 w-4" /> Edit</Button>
      <Button className="h-11 w-11 px-0" variant="ghost" onClick={() => {
        if (window.confirm(`Delete ${score.subjectName} ${score.examName}?`)) void deleteDoc(doc(db, "actualExamScores", score.scoreId));
      }} aria-label={`Delete ${score.examName}`}><Trash2 className="h-4 w-4 text-red-600" /></Button>
    </div>
  );
}

function PerformanceCard({ label, value, suffix = "%" }: { label: string; value: number; suffix?: string }) {
  const positive = value >= 50;
  return <Card><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-500">{label}</p>{positive ? <TrendingUp className="h-5 w-5 text-green-600" /> : <TrendingDown className="h-5 w-5 text-amber-600" />}</div><p className="mt-3 text-3xl font-bold">{value}{suffix}</p></Card>;
}

function ResultStatus({ status }: { status: ActualExamScore["status"] }) {
  return <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${status === "pass" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{status}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-semibold">{label}<div className="mt-1">{children}</div></label>;
}
