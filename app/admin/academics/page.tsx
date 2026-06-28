"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { handleSnapshotError } from "@/lib/firestore-errors";
import type { ActualExamScore, AppUser, ExamResult, ExamTimetableEntry } from "@/types/models";

type ViewMode = "scores" | "timetable" | "mocks";

export default function AdminAcademicsPage() {
  const { appUser } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [scores, setScores] = useState<ActualExamScore[]>([]);
  const [timetable, setTimetable] = useState<ExamTimetableEntry[]>([]);
  const [mocks, setMocks] = useState<ExamResult[]>([]);
  const [view, setView] = useState<ViewMode>("scores");
  const [userFilter, setUserFilter] = useState("all");
  const [semesterFilter, setSemesterFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");

  useEffect(() => {
    if (appUser?.role !== "admin") return;
    const subscriptions = [
      onSnapshot(collection(db, "users"), (snapshot) => setUsers(snapshot.docs.map((item) => item.data() as AppUser)), (error) => handleSnapshotError(error, "admin academic users")),
      onSnapshot(collection(db, "actualExamScores"), (snapshot) => setScores(snapshot.docs.map((item) => item.data() as ActualExamScore)), (error) => handleSnapshotError(error, "admin scores")),
      onSnapshot(collection(db, "examTimetable"), (snapshot) => setTimetable(snapshot.docs.map((item) => item.data() as ExamTimetableEntry)), (error) => handleSnapshotError(error, "admin timetable")),
      onSnapshot(collection(db, "examResults"), (snapshot) => setMocks(snapshot.docs.map((item) => item.data() as ExamResult)), (error) => handleSnapshotError(error, "admin mock results"))
    ];
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, [appUser]);

  const userByOwner = useMemo(() => new Map(users.map((user) => [user.ownerId || user.uid, user])), [users]);
  const semesters = Array.from(new Set([...scores.map((item) => item.semesterName), ...timetable.map((item) => item.semesterName)])).filter(Boolean).sort();
  const subjects = Array.from(new Set([...scores.map((item) => item.subjectName), ...timetable.map((item) => item.subjectName)])).filter(Boolean).sort();
  const visibleScores = scores.filter((item) => matches(item.userId, item.semesterName, item.subjectName, item.examDate));
  const visibleTimetable = timetable.filter((item) => matches(item.userId, item.semesterName, item.subjectName, item.examDate));
  const visibleMocks = mocks.filter((item) => (userFilter === "all" || item.userId === userFilter) && (!dateFilter || item.date.startsWith(dateFilter)));

  function matches(ownerId: string, semester: string, subject: string, date: string) {
    return (userFilter === "all" || ownerId === userFilter)
      && (semesterFilter === "all" || semester === semesterFilter)
      && (subjectFilter === "all" || subject === subjectFilter)
      && (!dateFilter || date.startsWith(dateFilter));
  }

  return (
    <ProtectedRoute adminOnly>
      <AppShell>
        <PageHeader title="Admin Academics" description="Review approved users' timetable entries, actual AVN scores, and mock-test summaries without exposing credentials." />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Select value={userFilter} onChange={(event) => setUserFilter(event.target.value)} aria-label="Filter by user">
            <option value="all">All users</option>
            {users.filter((user) => user.approved).map((user) => <option key={user.uid} value={user.ownerId || user.uid}>{user.email}</option>)}
          </Select>
          <Select value={semesterFilter} onChange={(event) => setSemesterFilter(event.target.value)} aria-label="Filter by semester">
            <option value="all">All semesters</option>{semesters.map((semester) => <option key={semester} value={semester}>{semester}</option>)}
          </Select>
          <Select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} aria-label="Filter by subject">
            <option value="all">All subjects</option>{subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
          </Select>
          <Input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} aria-label="Filter by date" />
        </div>
        <div className="mt-4 inline-flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
          {(["scores", "timetable", "mocks"] as ViewMode[]).map((item) => <button key={item} className={`min-h-10 rounded-md px-4 text-sm font-semibold ${view === item ? "bg-ink text-white dark:bg-aqua dark:text-slate-950" : ""}`} onClick={() => setView(item)}>{item}</button>)}
        </div>
        <div className="mt-5 grid gap-3">
          {view === "scores" ? visibleScores.map((item) => <AcademicRow key={item.scoreId} user={userByOwner.get(item.userId)} title={`${item.subjectName} - ${item.examName}`} meta={`${item.semesterName} / ${item.examDate}`} value={`${item.percentage}% (${item.status})`} />) : null}
          {view === "timetable" ? visibleTimetable.map((item) => <AcademicRow key={item.examId} user={userByOwner.get(item.userId)} title={item.title} meta={`${item.semesterName} / ${item.subjectName} / ${item.examDate}`} value={item.status} />) : null}
          {view === "mocks" ? visibleMocks.map((item) => <AcademicRow key={item.resultId} user={userByOwner.get(item.userId)} title={item.pdfName} meta={new Date(item.date).toLocaleString()} value={`${item.percentage}%`} />) : null}
          {(view === "scores" ? !visibleScores.length : view === "timetable" ? !visibleTimetable.length : !visibleMocks.length) ? <Card className="text-center text-sm text-slate-500">No academic records match these filters.</Card> : null}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}

function AcademicRow({ user, title, meta, value }: { user?: AppUser; title: string; meta: string; value: string }) {
  return <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-sm font-semibold text-aqua">{user?.email || "Unknown owner"}</p><h2 className="mt-1 break-words font-bold">{title}</h2><p className="mt-1 text-sm text-slate-500">{meta}</p></div><p className="shrink-0 text-lg font-bold">{value}</p></Card>;
}
