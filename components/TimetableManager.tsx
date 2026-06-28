"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { arrayUnion, collection, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc, where } from "firebase/firestore";
import { Bell, CalendarDays, CheckCircle2, Clock3, List, Pencil, Plus, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { dataOwnerId } from "@/lib/account";
import { examDateTime, examTypePresets, reminderKeys, validateTimetableEntry } from "@/lib/academic";
import { db } from "@/lib/firebase";
import { handleSnapshotError } from "@/lib/firestore-errors";
import { useAcademicCatalog } from "@/lib/use-academic-catalog";
import type { ExamTimetableEntry, ExamTimetableStatus, Semester, Subject, UserPreferences } from "@/types/models";

type ViewMode = "upcoming" | "list" | "calendar";

export function TimetableManager({ summary = false }: { summary?: boolean }) {
  const { appUser } = useAuth();
  const { semesters, subjects, addSubject } = useAcademicCatalog();
  const [entries, setEntries] = useState<ExamTimetableEntry[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [editing, setEditing] = useState<ExamTimetableEntry | "new" | null>(null);
  const [view, setView] = useState<ViewMode>("upcoming");
  const [semesterFilter, setSemesterFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (!appUser) return;
    const ownerId = dataOwnerId(appUser);
    const unsubscribeEntries = onSnapshot(
      query(collection(db, "examTimetable"), where("userId", "==", ownerId)),
      (snapshot) => setEntries(snapshot.docs.map((item) => item.data() as ExamTimetableEntry)),
      (error) => handleSnapshotError(error, "exam timetable")
    );
    const unsubscribePreferences = onSnapshot(
      doc(db, "userPreferences", ownerId),
      (snapshot) => setPreferences(snapshot.exists() ? snapshot.data() as UserPreferences : null),
      (error) => handleSnapshotError(error, "reminder preferences")
    );
    return () => {
      unsubscribeEntries();
      unsubscribePreferences();
    };
  }, [appUser]);

  const now = new Date();
  const visible = useMemo(() => entries
    .filter((entry) => semesterFilter === "all" || entry.semesterId === semesterFilter)
    .filter((entry) => subjectFilter === "all" || entry.subjectId === subjectFilter)
    .filter((entry) => statusFilter === "all" || entry.status === statusFilter)
    .filter((entry) => view !== "upcoming" || (entry.status === "upcoming" && examDateTime(entry).getTime() >= Date.now() - 86_400_000))
    .sort((a, b) => examDateTime(a).getTime() - examDateTime(b).getTime()), [entries, semesterFilter, statusFilter, subjectFilter, view]);
  const reminders = entries.flatMap((entry) =>
    reminderKeys(entry, now)
      .filter((key) => !preferences?.reminderAcknowledgements?.includes(key))
      .map((key) => ({ key, entry, days: Number(key.split(":").at(-1)) }))
  );

  if (summary) {
    const upcoming = entries
      .filter((entry) => entry.status === "upcoming" && examDateTime(entry).getTime() >= now.getTime())
      .sort((a, b) => examDateTime(a).getTime() - examDateTime(b).getTime());
    const next = upcoming[0];
    const days = next ? Math.max(0, Math.ceil((examDateTime(next).getTime() - now.getTime()) / 86_400_000)) : 0;
    const thisWeek = upcoming.filter((entry) => examDateTime(entry).getTime() - now.getTime() <= 7 * 86_400_000).length;
    return (
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-500">Next exam</p>
            <h2 className="mt-1 break-words font-bold">{next ? next.title : "No upcoming exams"}</h2>
          </div>
          <CalendarDays className="h-6 w-6 text-aqua" />
        </div>
        {next ? (
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-2xl font-bold">{days}</p><p className="text-slate-500">days remaining</p></div>
            <div><p className="text-2xl font-bold">{thisWeek}</p><p className="text-slate-500">this week</p></div>
          </div>
        ) : <p className="mt-3 text-sm text-slate-500">Add your university exams to see countdowns and reminders.</p>}
      </Card>
    );
  }

  async function acknowledgeReminder(key: string) {
    if (!appUser) return;
    const ownerId = dataOwnerId(appUser);
    await setDoc(
      doc(db, "userPreferences", ownerId),
      {
        userId: ownerId,
        themePreference: preferences?.themePreference || appUser.themePreference || "system",
        showDashboardQuote: preferences?.showDashboardQuote ?? true,
        reminderAcknowledgements: arrayUnion(key),
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
  }

  async function changeStatus(entry: ExamTimetableEntry, status: ExamTimetableStatus) {
    await updateDoc(doc(db, "examTimetable", entry.examId), { status, updatedAt: new Date().toISOString() });
    toast.success(`Exam marked ${status}`);
  }

  return (
    <div>
      {reminders.length ? (
        <div className="mb-5 grid gap-3">
          {reminders.map((reminder) => (
            <Card key={reminder.key} className="flex flex-col gap-3 border-amber-200 bg-amber-50 sm:flex-row sm:items-center">
              <Bell className="h-5 w-5 shrink-0 text-amber-700" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{reminder.entry.title}</p>
                <p className="text-sm text-amber-800">{reminder.days === 0 ? "Exam day" : `${reminder.days} day${reminder.days === 1 ? "" : "s"} remaining`} - {reminder.entry.subjectName}</p>
              </div>
              <Button variant="secondary" onClick={() => void acknowledgeReminder(reminder.key)}>Acknowledge</Button>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
            <ViewButton active={view === "upcoming"} onClick={() => setView("upcoming")} icon={Clock3} label="Upcoming" />
            <ViewButton active={view === "list"} onClick={() => setView("list")} icon={List} label="List" />
            <ViewButton active={view === "calendar"} onClick={() => setView("calendar")} icon={CalendarDays} label="Calendar" />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={async () => {
              if (!("Notification" in window)) return toast.error("Browser notifications are not supported here.");
              const permission = await Notification.requestPermission();
              toast[permission === "granted" ? "success" : "error"](permission === "granted" ? "Browser reminders enabled while PadLEI is available." : "Notification permission was not granted.");
            }}><Bell className="h-4 w-4" /> Notifications</Button>
            <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add exam</Button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Select value={semesterFilter} onChange={(event) => {
            setSemesterFilter(event.target.value);
            setSubjectFilter("all");
          }} aria-label="Filter timetable by semester">
            <option value="all">All semesters</option>
            {semesters.map((semester) => <option key={semester.semesterId} value={semester.semesterId}>{semester.name}</option>)}
          </Select>
          <Select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} aria-label="Filter timetable by subject">
            <option value="all">All subjects</option>
            {subjects.filter((subject) => semesterFilter === "all" || subject.semesterId === semesterFilter).map((subject) => <option key={`${subject.semesterId}_${subject.subjectId}`} value={subject.subjectId}>{subject.name}</option>)}
          </Select>
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter timetable by status">
            <option value="all">All statuses</option>
            <option value="upcoming">Upcoming</option>
            <option value="completed">Completed</option>
            <option value="postponed">Postponed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
      </div>

      <div className={`mt-5 grid gap-4 ${view === "calendar" ? "md:grid-cols-2 xl:grid-cols-3" : ""}`}>
        {visible.map((entry) => (
          <Card key={entry.examId}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-aqua">{entry.examType}</p>
                <h2 className="mt-1 break-words font-bold">{entry.title}</h2>
                <p className="mt-1 text-sm text-slate-500">{entry.semesterName} / {entry.subjectName}</p>
              </div>
              <StatusPill status={entry.status} />
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" /> {entry.examDate}</span>
              <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4" /> {entry.startTime} - {entry.endTime}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setEditing(entry)}><Pencil className="h-4 w-4" /> Edit</Button>
              {entry.status !== "completed" ? <Button variant="secondary" onClick={() => void changeStatus(entry, "completed")}><CheckCircle2 className="h-4 w-4" /> Complete</Button> : null}
              {entry.status !== "postponed" ? <Button variant="ghost" onClick={() => void changeStatus(entry, "postponed")}>Postpone</Button> : null}
              {entry.status !== "cancelled" ? <Button variant="ghost" onClick={() => void changeStatus(entry, "cancelled")}>Cancel</Button> : null}
              <Button className="h-11 w-11 px-0" variant="ghost" onClick={() => {
                if (window.confirm(`Delete ${entry.title}?`)) void deleteDoc(doc(db, "examTimetable", entry.examId));
              }} aria-label={`Delete ${entry.title}`}><Trash2 className="h-4 w-4 text-red-600" /></Button>
            </div>
          </Card>
        ))}
        {!visible.length ? <Card className="text-center text-sm text-slate-500">No exams match this view. Add an exam or change the filters.</Card> : null}
      </div>

      {editing ? (
        <TimetableForm
          entry={editing === "new" ? undefined : editing}
          semesters={semesters}
          subjects={subjects}
          ownerId={appUser ? dataOwnerId(appUser) : ""}
          onCreateSubject={addSubject}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function TimetableForm({
  entry,
  semesters,
  subjects,
  ownerId,
  onCreateSubject,
  onClose
}: {
  entry?: ExamTimetableEntry;
  semesters: Semester[];
  subjects: Subject[];
  ownerId: string;
  onCreateSubject: (semester: Pick<Semester, "semesterId" | "name">, name: string, isCustom?: boolean) => Promise<Subject>;
  onClose: () => void;
}) {
  const [semesterId, setSemesterId] = useState(entry?.semesterId || "uncategorized");
  const [subjectName, setSubjectName] = useState(entry?.subjectName || "General");
  const [examType, setExamType] = useState(entry?.examType || "AVN 1");
  const [busy, setBusy] = useState(false);
  const semester = semesters.find((item) => item.semesterId === semesterId) || semesters[0];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!semester) return;
    const form = new FormData(event.currentTarget);
    const validation = validateTimetableEntry({
      examDate: String(form.get("examDate") || ""),
      startTime: String(form.get("startTime") || ""),
      endTime: String(form.get("endTime") || "")
    });
    if (validation) return toast.error(validation);
    setBusy(true);
    try {
      const subject = await onCreateSubject(semester, subjectName);
      const now = new Date().toISOString();
      const examId = entry?.examId || crypto.randomUUID();
      const record: ExamTimetableEntry = {
        examId,
        userId: ownerId,
        title: String(form.get("title") || "").trim(),
        semesterId: semester.semesterId,
        semesterName: semester.name,
        subjectId: subject.subjectId,
        subjectName: subject.name,
        examType: examType.trim(),
        examDate: String(form.get("examDate") || ""),
        startTime: String(form.get("startTime") || ""),
        endTime: String(form.get("endTime") || ""),
        status: entry?.status || "upcoming",
        createdAt: entry?.createdAt || now,
        updatedAt: now
      };
      if (!record.title || !record.examType) throw new Error("Title and exam type are required.");
      await setDoc(doc(db, "examTimetable", examId), record);
      toast.success(entry ? "Exam updated" : "Exam added");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save exam.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/60 px-4 py-6" role="dialog" aria-modal="true">
      <Card className="mx-auto w-full max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{entry ? "Edit exam" : "Add exam"}</h2>
          <Button className="h-11 w-11 px-0" variant="ghost" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></Button>
        </div>
        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <Field label="Title"><Input name="title" defaultValue={entry?.title} maxLength={100} required /></Field>
          <Field label="Semester"><Select value={semesterId} onChange={(event) => {
            setSemesterId(event.target.value);
            setSubjectName("General");
          }}>{semesters.map((item) => <option key={item.semesterId} value={item.semesterId}>{item.name}</option>)}</Select></Field>
          <Field label="Subject"><Input list="timetable-subjects" value={subjectName} onChange={(event) => setSubjectName(event.target.value)} maxLength={100} required /><datalist id="timetable-subjects">{subjects.filter((subject) => subject.semesterId === semesterId).map((subject) => <option key={subject.subjectId} value={subject.name} />)}</datalist></Field>
          <Field label="Exam type"><Input list="exam-types" value={examType} onChange={(event) => setExamType(event.target.value)} maxLength={60} required /><datalist id="exam-types">{examTypePresets.map((type) => <option key={type} value={type} />)}</datalist></Field>
          <Field label="Exam date"><Input name="examDate" type="date" defaultValue={entry?.examDate} required /></Field>
          <Field label="Start time"><Input name="startTime" type="time" defaultValue={entry?.startTime} required /></Field>
          <Field label="End time"><Input name="endTime" type="time" defaultValue={entry?.endTime} required /></Field>
          <div className="sm:col-span-2"><Button className="w-full" disabled={busy}>{busy ? "Saving..." : "Save exam"}</Button></div>
        </form>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-semibold">{label}<div className="mt-1">{children}</div></label>;
}

function ViewButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return <button className={`inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold ${active ? "bg-ink text-white" : "text-slate-600"}`} onClick={onClick} aria-pressed={active}><Icon className="h-4 w-4" /> {label}</button>;
}

function StatusPill({ status }: { status: ExamTimetableStatus }) {
  const color = status === "upcoming" ? "bg-blue-100 text-blue-800" : status === "completed" ? "bg-green-100 text-green-800" : status === "postponed" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700";
  return <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-semibold ${color}`}>{status}</span>;
}
