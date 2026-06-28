"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import {
  BookOpen,
  FilePenLine,
  FileText,
  GraduationCap,
  Grid2X2,
  Library,
  List,
  Plus,
  Search,
  Upload,
  X
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { dataOwnerId } from "@/lib/account";
import { medicalSubjectPresets } from "@/lib/academic";
import { db } from "@/lib/firebase";
import { handleSnapshotError } from "@/lib/firestore-errors";
import { useAcademicCatalog } from "@/lib/use-academic-catalog";
import { formatDate } from "@/lib/utils";
import type { PdfFile, Progress, Semester } from "@/types/models";

type SortMode = "newest" | "oldest" | "alphabetical";
type ViewMode = "grid" | "list";

export function LibraryView({ compact = false }: { compact?: boolean }) {
  const { appUser } = useAuth();
  const { semesters, subjects, addSemester, addSubject } = useAcademicCatalog();
  const [pdfs, setPdfs] = useState<PdfFile[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [search, setSearch] = useState("");
  const [semesterFilter, setSemesterFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [movingPdf, setMovingPdf] = useState<PdfFile | null>(null);
  const [createSemesterOpen, setCreateSemesterOpen] = useState(false);

  useEffect(() => {
    if (!appUser) return;
    const ownerId = dataOwnerId(appUser);
    const unsubscribePdfs = onSnapshot(
      query(collection(db, "pdfs"), where("userId", "==", ownerId)),
      (snapshot) => setPdfs(snapshot.docs.map((item) => item.data() as PdfFile)),
      (error) => handleSnapshotError(error, "library")
    );
    const unsubscribeProgress = onSnapshot(
      query(collection(db, "progress"), where("userId", "==", ownerId)),
      (snapshot) => setProgress(snapshot.docs.map((item) => item.data() as Progress)),
      (error) => handleSnapshotError(error, "library progress")
    );
    return () => {
      unsubscribePdfs();
      unsubscribeProgress();
    };
  }, [appUser]);

  const visiblePdfs = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return pdfs
      .filter((pdf) => !needle || [pdf.fileName, pdf.semesterName, pdf.subjectName].some((value) => value?.toLocaleLowerCase().includes(needle)))
      .filter((pdf) => semesterFilter === "all" || (pdf.semesterId || "uncategorized") === semesterFilter)
      .filter((pdf) => subjectFilter === "all" || (pdf.subjectId || "general") === subjectFilter)
      .sort((a, b) => {
        if (sortMode === "alphabetical") return a.fileName.localeCompare(b.fileName);
        return sortMode === "oldest" ? a.uploadedAt.localeCompare(b.uploadedAt) : b.uploadedAt.localeCompare(a.uploadedAt);
      });
  }, [pdfs, search, semesterFilter, subjectFilter, sortMode]);

  const visibleSubjects = useMemo(
    () => subjects.filter((subject) => semesterFilter === "all" || subject.semesterId === semesterFilter),
    [semesterFilter, subjects]
  );

  const progressByPdf = useMemo(() => new Map(progress.map((item) => [item.pdfId, item])), [progress]);
  const items = compact ? visiblePdfs.slice(0, 3) : visiblePdfs;

  async function createSemester(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") || "");
    try {
      await addSemester(name);
      form.reset();
      setCreateSemesterOpen(false);
      toast.success("Semester created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create semester.");
    }
  }

  return (
    <div className="min-w-0">
      {!compact ? (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search PDFs, subjects, or semesters" aria-label="Search library" />
            </div>
            <Select value={semesterFilter} onChange={(event) => {
              setSemesterFilter(event.target.value);
              setSubjectFilter("all");
            }} aria-label="Filter by semester">
              <option value="all">All semesters</option>
              {semesters.map((semester) => <option key={semester.semesterId} value={semester.semesterId}>{semester.name}</option>)}
            </Select>
            <Select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} aria-label="Filter by subject">
              <option value="all">All subjects</option>
              {visibleSubjects.map((subject) => <option key={`${subject.semesterId}_${subject.subjectId}`} value={subject.subjectId}>{subject.name}</option>)}
            </Select>
            <Select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} aria-label="Sort library">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="alphabetical">A to Z</option>
            </Select>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setCreateSemesterOpen(true)}><Plus className="h-4 w-4" /> Semester</Button>
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1" aria-label="Library view">
                <button className={`grid h-9 w-10 place-items-center rounded-md ${viewMode === "grid" ? "bg-ink text-white" : "text-slate-600"}`} onClick={() => setViewMode("grid")} aria-label="Grid view" aria-pressed={viewMode === "grid"}>
                  <Grid2X2 className="h-4 w-4" />
                </button>
                <button className={`grid h-9 w-10 place-items-center rounded-md ${viewMode === "list" ? "bg-ink text-white" : "text-slate-600"}`} onClick={() => setViewMode("list")} aria-label="List view" aria-pressed={viewMode === "list"}>
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
            <Button asChild><Link href="/upload"><Upload className="h-4 w-4" /> Upload PDF</Link></Button>
          </div>
        </>
      ) : null}

      <div className={`${compact ? "" : "mt-5"} grid min-w-0 gap-4 ${viewMode === "grid" && !compact ? "md:grid-cols-2 xl:grid-cols-3" : ""}`}>
        {items.map((pdf) => {
          const pdfProgress = progressByPdf.get(pdf.pdfId);
          const studied = pdfProgress?.studiedQuestions.length || 0;
          const total = Math.max(pdf.totalQuestions || 0, 1);
          const progressPercent = Math.min(100, Math.round((studied / total) * 100));
          return (
            <Card key={pdf.pdfId} className="min-w-0">
              <div className="flex min-w-0 items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-berry/10 text-berry">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="break-words font-semibold leading-6">{pdf.fileName}</h2>
                  <p className="mt-1 text-xs text-slate-500">{pdf.semesterName || "Uncategorized"} / {pdf.subjectName || "General"}</p>
                </div>
                <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{pdf.status}</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <Metric label="Questions" value={pdf.totalQuestions || 0} />
                <Metric label="Ready" value={pdf.readyQuestions || 0} />
                <Metric label="Studied" value={`${progressPercent}%`} />
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100" aria-label={`${progressPercent}% studied`}>
                <div className="h-full bg-aqua" style={{ width: `${progressPercent}%` }} />
              </div>
              <p className="mt-3 text-xs text-slate-500">{formatDate(pdf.uploadedAt)}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button variant="secondary" asChild><Link href={`/pdfs/${pdf.pdfId}`}><FileText className="h-4 w-4" /> Open</Link></Button>
                <Button asChild><Link href={`/study/${pdf.pdfId}`}><BookOpen className="h-4 w-4" /> Study</Link></Button>
                <Button variant="secondary" asChild><Link href={`/exam/${pdf.pdfId}`}><GraduationCap className="h-4 w-4" /> Mock test</Link></Button>
                <Button variant="ghost" onClick={() => setMovingPdf(pdf)}><FilePenLine className="h-4 w-4" /> Organize</Button>
              </div>
            </Card>
          );
        })}
      </div>

      {!items.length ? (
        <Card className="mt-5 text-center">
          <Library className="mx-auto h-9 w-9 text-slate-400" />
          <h2 className="mt-3 font-bold">No PDFs found</h2>
          <p className="mt-1 text-sm text-slate-500">{pdfs.length ? "Try clearing your search or filters." : "Upload your first PDF to start building this library."}</p>
          {!pdfs.length ? <Button className="mt-4" asChild><Link href="/upload"><Upload className="h-4 w-4" /> Upload PDF</Link></Button> : null}
        </Card>
      ) : null}

      {movingPdf ? (
        <MovePdfDialog
          pdf={movingPdf}
          semesters={semesters}
          subjects={subjects}
          onClose={() => setMovingPdf(null)}
          onSave={async ({ semester, subjectName }) => {
            try {
              const subject = await addSubject(semester, subjectName, !medicalSubjectPresets.includes(subjectName as typeof medicalSubjectPresets[number]));
              await updateDoc(doc(db, "pdfs", movingPdf.pdfId), {
                semesterId: semester.semesterId,
                semesterName: semester.name,
                subjectId: subject.subjectId,
                subjectName: subject.name
              });
              setMovingPdf(null);
              toast.success("PDF organization updated");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not move PDF.");
            }
          }}
        />
      ) : null}

      {createSemesterOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 px-4 py-6" role="dialog" aria-modal="true">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Create custom semester</h2>
              <Button className="h-11 w-11 px-0" variant="ghost" onClick={() => setCreateSemesterOpen(false)} aria-label="Close"><X className="h-5 w-5" /></Button>
            </div>
            <form className="mt-4 space-y-3" onSubmit={createSemester}>
              <label className="block text-sm font-semibold">Semester name<Input className="mt-1" name="name" maxLength={80} required /></label>
              <Button className="w-full"><Plus className="h-4 w-4" /> Create semester</Button>
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function MovePdfDialog({
  pdf,
  semesters,
  subjects,
  onClose,
  onSave
}: {
  pdf: PdfFile;
  semesters: Semester[];
  subjects: Array<{ subjectId: string; semesterId: string; name: string }>;
  onClose: () => void;
  onSave: (value: { semester: Semester; subjectName: string }) => Promise<void>;
}) {
  const [semesterId, setSemesterId] = useState(pdf.semesterId || "uncategorized");
  const [subjectName, setSubjectName] = useState(pdf.subjectName || "General");
  const [busy, setBusy] = useState(false);
  const semester = semesters.find((item) => item.semesterId === semesterId) || semesters[0];
  const subjectOptions = Array.from(new Set([
    ...medicalSubjectPresets,
    ...subjects.filter((subject) => subject.semesterId === semesterId).map((subject) => subject.name)
  ]));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="move-pdf-title">
      <Card className="w-full max-w-lg">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="move-pdf-title" className="text-lg font-bold">Organize PDF</h2>
            <p className="mt-1 break-words text-sm text-slate-500">{pdf.fileName}</p>
          </div>
          <Button className="h-11 w-11 shrink-0 px-0" variant="ghost" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></Button>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-semibold">
            Semester
            <Select className="mt-1" value={semesterId} onChange={(event) => {
              setSemesterId(event.target.value);
              setSubjectName("General");
            }}>
              {semesters.map((item) => <option key={item.semesterId} value={item.semesterId}>{item.name}</option>)}
            </Select>
          </label>
          <label className="block text-sm font-semibold">
            Subject
            <Input className="mt-1" list="padlei-subjects" value={subjectName} onChange={(event) => setSubjectName(event.target.value)} maxLength={100} />
            <datalist id="padlei-subjects">{subjectOptions.map((name) => <option key={name} value={name} />)}</datalist>
          </label>
          <Button className="w-full" disabled={busy || !semester || !subjectName.trim()} onClick={async () => {
            if (!semester) return;
            setBusy(true);
            await onSave({ semester, subjectName: subjectName.trim() });
            setBusy(false);
          }}>{busy ? "Saving..." : "Save organization"}</Button>
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg bg-slate-50 p-2"><p className="font-bold text-ink">{value}</p><p className="truncate text-slate-500">{label}</p></div>;
}
