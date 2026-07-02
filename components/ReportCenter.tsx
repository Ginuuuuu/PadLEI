"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Download, FileBarChart, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/components/AuthProvider";
import { AcademicReportDocument, type AcademicReportData } from "@/components/reports/AcademicReportDocument";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { dataOwnerId } from "@/lib/account";
import { academicSummary, averagePercentage, normalizeAcademicName } from "@/lib/academic";
import { db } from "@/lib/firebase";
import { loadExamResult } from "@/lib/exam-results-client";
import { handleSnapshotError } from "@/lib/firestore-errors";
import { useAcademicCatalog } from "@/lib/use-academic-catalog";
import type { ActualExamScore, ExamResult } from "@/types/models";

type ReportKind = "mock" | "actual" | "selected-avn" | "subject" | "semester" | "overall";

export function ReportCenter() {
  const { appUser } = useAuth();
  const { semesters, subjects } = useAcademicCatalog();
  const [results, setResults] = useState<ExamResult[]>([]);
  const [scores, setScores] = useState<ActualExamScore[]>([]);
  const [mockId, setMockId] = useState("");
  const [scoreId, setScoreId] = useState("");
  const [subjectKey, setSubjectKey] = useState("");
  const [semesterId, setSemesterId] = useState("");
  const [busy, setBusy] = useState<ReportKind | "">("");

  useEffect(() => {
    if (!appUser) return;
    const ownerId = dataOwnerId(appUser);
    const unsubscribeResults = onSnapshot(
      query(collection(db, "examResults"), where("userId", "==", ownerId)),
      (snapshot) => {
        const items = snapshot.docs.map((item) => item.data() as ExamResult).sort((a, b) => b.date.localeCompare(a.date));
        setResults(items);
        setMockId((current) => current || items[0]?.resultId || "");
      },
      (error) => handleSnapshotError(error, "mock reports")
    );
    const unsubscribeScores = onSnapshot(
      query(collection(db, "actualExamScores"), where("userId", "==", ownerId)),
      (snapshot) => {
        const items = snapshot.docs.map((item) => item.data() as ActualExamScore).sort((a, b) => b.examDate.localeCompare(a.examDate));
        setScores(items);
        setScoreId((current) => current || items[0]?.scoreId || "");
        setSubjectKey((current) => current || items[0]?.subjectId || "");
        setSemesterId((current) => current || items[0]?.semesterId || "");
      },
      (error) => handleSnapshotError(error, "AVN reports")
    );
    return () => {
      unsubscribeResults();
      unsubscribeScores();
    };
  }, [appUser]);

  const availableSubjects = useMemo(() => {
    const byId = new Map(subjects.map((subject) => [subject.subjectId, subject.name]));
    for (const score of scores) byId.set(score.subjectId, score.subjectName);
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [scores, subjects]);

  async function download(kind: ReportKind) {
    if (!appUser) return;
    setBusy(kind);
    try {
      let reportResults = results;
      if (kind === "mock") {
        const detailedResult = await loadExamResult(mockId);
        reportResults = results.map((result) => result.resultId === detailedResult.resultId ? detailedResult : result);
      }
      const report = buildReport(kind, {
        appUser,
        results: reportResults,
        scores,
        mockId,
        scoreId,
        subjectKey,
        semesterId
      });
      const { pdf } = await import("@react-pdf/renderer");
      const blob = await pdf(<AcademicReportDocument data={report.data} />).toBlob();
      await saveReportBlob(blob, report.fileName);
      toast.success(`${report.fileName} downloaded`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate report.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ReportCard title="Individual mock-test report" description="Includes the full question-by-question answer review.">
        <Select value={mockId} onChange={(event) => setMockId(event.target.value)} aria-label="Choose mock test">
          <option value="">Choose a mock test</option>
          {results.map((result) => <option key={result.resultId} value={result.resultId}>{result.pdfName} - {new Date(result.date).toLocaleDateString()}</option>)}
        </Select>
        <DownloadButton busy={busy === "mock"} disabled={!mockId} onClick={() => void download("mock")} label="Download mock report" />
      </ReportCard>

      <ReportCard title="Individual actual AVN report" description="Includes marks, pass status, notes, and mock comparison.">
        <Select value={scoreId} onChange={(event) => setScoreId(event.target.value)} aria-label="Choose actual AVN score">
          <option value="">Choose an actual AVN exam</option>
          {scores.map((score) => <option key={score.scoreId} value={score.scoreId}>{score.subjectName} - {score.examName} - {score.examDate}</option>)}
        </Select>
        <div className="grid gap-2 sm:grid-cols-2">
          <DownloadButton busy={busy === "actual"} disabled={!scoreId} onClick={() => void download("actual")} label="Individual report" />
          <DownloadButton busy={busy === "selected-avn"} disabled={!scoreId} onClick={() => void download("selected-avn")} label="Selected AVN report" />
        </div>
      </ReportCard>

      <ReportCard title="Subject performance report" description="Combines mock-test and actual AVN trends for one subject.">
        <Select value={subjectKey} onChange={(event) => setSubjectKey(event.target.value)} aria-label="Choose subject">
          <option value="">Choose a subject</option>
          {availableSubjects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </Select>
        <DownloadButton busy={busy === "subject"} disabled={!subjectKey} onClick={() => void download("subject")} label="Download subject report" />
      </ReportCard>

      <ReportCard title="Semester performance report" description="Summarizes subjects, actual scores, mock tests, and semester average.">
        <Select value={semesterId} onChange={(event) => setSemesterId(event.target.value)} aria-label="Choose semester">
          <option value="">Choose a semester</option>
          {semesters.map((semester) => <option key={semester.semesterId} value={semester.semesterId}>{semester.name}</option>)}
        </Select>
        <DownloadButton busy={busy === "semester"} disabled={!semesterId} onClick={() => void download("semester")} label="Download semester report" />
      </ReportCard>

      <ReportCard title="Overall academic report" description="Compares semesters and highlights strengths and areas needing improvement.">
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{scores.length} actual AVN records and {results.length} mock tests will be included.</p>
        <DownloadButton busy={busy === "overall"} disabled={!scores.length && !results.length} onClick={() => void download("overall")} label="Download overall report" />
      </ReportCard>
    </div>
  );
}

function buildReport(
  kind: ReportKind,
  context: {
    appUser: NonNullable<ReturnType<typeof useAuth>["appUser"]>;
    results: ExamResult[];
    scores: ActualExamScore[];
    mockId: string;
    scoreId: string;
    subjectKey: string;
    semesterId: string;
  }
) {
  const generatedAt = new Date().toLocaleString();
  const student = {
    studentName: context.appUser.name || "PadLEI Student",
    studentEmail: context.appUser.email,
    profilePhotoUrl: context.appUser.profilePhotoUrl,
    generatedAt
  };

  if (kind === "mock") {
    const result = context.results.find((item) => item.resultId === context.mockId);
    if (!result) throw new Error("Choose a mock test.");
    const answers = new Map(result.answers.map((answer) => [answer.questionId, answer]));
    const data: AcademicReportData = {
      ...student,
      title: "Individual Mock-Test Report",
      subtitle: result.pdfName,
      summary: [
        { label: "Test date", value: new Date(result.date).toLocaleString() },
        { label: "Total questions", value: String(result.totalQuestions) },
        { label: "Attempted", value: String(result.attempted) },
        { label: "Correct", value: String(result.correct) },
        { label: "Wrong", value: String(result.wrong) },
        { label: "Unattempted", value: String(result.unattempted) },
        { label: "Marks", value: String(result.marks) },
        { label: "Percentage", value: `${result.percentage}%` },
        { label: "Time taken", value: `${Math.round(result.timeTaken / 60)} minutes` }
      ],
      sections: [{ title: "Test summary", rows: [
        { label: "PDF / subject", value: result.pdfName },
        { label: "Result status", value: result.percentage >= 50 ? "Pass" : "Needs improvement" }
      ] }],
      review: result.questions.map((question, index) => {
        const answer = answers.get(question.id);
        return {
          number: question.questionNumber || index + 1,
          question: question.questionText,
          selectedAnswer: answer?.selectedAnswerText || answer?.selectedDisplayAnswer || answer?.selectedAnswer || "",
          correctAnswer: answer?.correctAnswerText || answer?.correctDisplayAnswer || answer?.correctAnswer || "",
          status: answer?.isCorrect ? "Correct" : answer?.selectedAnswer ? "Wrong" : "Unattempted"
        };
      })
    };
    return { data, fileName: `PadLEI_Mock_Test_${safeFileName(result.pdfName)}_${dateStamp(result.date)}.pdf` };
  }

  if (kind === "actual" || kind === "selected-avn") {
    const score = context.scores.find((item) => item.scoreId === context.scoreId);
    if (!score) throw new Error("Choose an actual AVN exam.");
    const matchingMocks = context.results.filter((result) => normalizeAcademicName(result.pdfName).includes(normalizeAcademicName(score.subjectName)));
    const data: AcademicReportData = {
      ...student,
      title: kind === "selected-avn" ? "Selected AVN Exam Report" : "Individual Actual AVN Report",
      subtitle: `${score.subjectName} - ${score.examName}`,
      summary: [
        { label: "Exam date", value: score.examDate },
        { label: "Obtained marks", value: String(score.obtainedMarks) },
        { label: "Maximum marks", value: String(score.maximumMarks) },
        { label: "Percentage", value: `${score.percentage}%` },
        { label: "Pass mark", value: String(score.passMark) },
        { label: "Status", value: score.status.toUpperCase() }
      ],
      sections: [{ title: "Exam details", rows: [
        { label: "Semester", value: score.semesterName },
        { label: "Subject", value: score.subjectName },
        { label: "Exam", value: score.examName },
        { label: "Grade", value: score.grade || "Not recorded" },
        { label: "Notes", value: score.notes || "No notes" },
        { label: "Mock-test average", value: matchingMocks.length ? `${averagePercentage(matchingMocks.map((result) => result.percentage))}%` : "Insufficient data" }
      ] }]
    };
    return { data, fileName: `PadLEI_${safeFileName(score.examName)}_${safeFileName(score.subjectName)}_${dateStamp(score.examDate)}.pdf` };
  }

  const filteredScores = kind === "subject"
    ? context.scores.filter((score) => score.subjectId === context.subjectKey)
    : kind === "semester"
      ? context.scores.filter((score) => score.semesterId === context.semesterId)
      : context.scores;
  const subjectName = filteredScores[0]?.subjectName || "Selected Subject";
  const filteredMocks = kind === "subject"
    ? context.results.filter((result) => normalizeAcademicName(result.pdfName).includes(normalizeAcademicName(subjectName)))
    : context.results;
  const summary = academicSummary(filteredScores, filteredMocks);
  if (!filteredScores.length && !filteredMocks.length) throw new Error("Insufficient data for this report.");
  const title = kind === "subject" ? "Subject Performance Report" : kind === "semester" ? "Semester Performance Report" : "Overall Academic Performance Report";
  const subtitle = kind === "subject" ? subjectName : kind === "semester" ? filteredScores[0]?.semesterName || "Selected semester" : "All included academic records";
  const data: AcademicReportData = {
    ...student,
    title,
    subtitle,
    summary: [
      { label: "Overall percentage", value: `${summary.overallAverage}%` },
      { label: "Actual AVN average", value: `${summary.actualAverage}%` },
      { label: "Mock-test average", value: `${summary.mockAverage}%` },
      { label: "Actual exams", value: String(filteredScores.length) },
      { label: "Mock tests", value: String(filteredMocks.length) },
      { label: "Subjects included", value: String(summary.subjects.length) }
    ],
    sections: [
      {
        title: "Performance overview",
        rows: [
          { label: "Strongest subject", value: summary.highestSubject?.subjectName || "Insufficient data", secondary: summary.highestSubject ? `${summary.highestSubject.combinedAverage}% combined` : undefined },
          { label: "Needs improvement", value: summary.lowestSubject?.subjectName || "Insufficient data", secondary: summary.lowestSubject ? `${summary.lowestSubject.combinedAverage}% combined` : undefined },
          ...summary.subjects.map((subject) => ({
            label: subject.subjectName,
            value: `${subject.combinedAverage}% combined`,
            secondary: `Mock ${subject.mockAverage}% / Actual ${subject.actualAverage}%`
          }))
        ]
      },
      {
        title: "Actual AVN records",
        rows: filteredScores.length ? filteredScores.map((score) => ({
          label: `${score.subjectName} - ${score.examName}`,
          value: `${score.percentage}% (${score.obtainedMarks}/${score.maximumMarks})`,
          secondary: `${score.examDate} - ${score.status}`
        })) : [{ label: "Actual AVN data", value: "Insufficient data" }]
      }
    ]
  };
  const fileName = kind === "subject"
    ? `PadLEI_Subject_Performance_${safeFileName(subjectName)}.pdf`
    : kind === "semester"
      ? `PadLEI_${safeFileName(subtitle)}_Performance.pdf`
      : "PadLEI_Overall_Academic_Performance.pdf";
  return { data, fileName };
}

function ReportCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <Card><FileBarChart className="h-6 w-6 text-aqua" /><h2 className="mt-4 font-bold">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p><div className="mt-5 space-y-3">{children}</div></Card>;
}

function DownloadButton({ busy, disabled, onClick, label }: { busy: boolean; disabled: boolean; onClick: () => void; label: string }) {
  return <Button className="w-full" disabled={disabled || busy} onClick={onClick}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{busy ? "Generating report..." : label}</Button>;
}

function safeFileName(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "Report";
}

function dateStamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

async function saveReportBlob(blob: Blob, fileName: string) {
  type AndroidDownloadBridge = {
    beginBase64File?: (transferId: string, fileName: string, mimeType: string) => boolean;
    appendBase64FileChunk?: (transferId: string, chunk: string) => boolean;
    finishBase64File?: (transferId: string) => boolean;
    cancelBase64File?: (transferId: string) => void;
    saveBase64File?: (base64: string, fileName: string, mimeType: string) => boolean | void;
  };
  const nativeWindow = window as typeof window & {
    PadLEINative?: AndroidDownloadBridge;
    webkit?: { messageHandlers?: { padleiDownload?: { postMessage: (payload: Record<string, string>) => void } } };
  };
  const androidBridge = nativeWindow.PadLEINative;
  if (
    androidBridge?.beginBase64File
    && androidBridge.appendBase64FileChunk
    && androidBridge.finishBase64File
  ) {
    await saveAndroidReportInChunks({
      beginBase64File: androidBridge.beginBase64File,
      appendBase64FileChunk: androidBridge.appendBase64FileChunk,
      finishBase64File: androidBridge.finishBase64File,
      cancelBase64File: androidBridge.cancelBase64File
    }, blob, fileName);
    return;
  }
  if (androidBridge?.saveBase64File) {
    const accepted = androidBridge.saveBase64File(await blobToBase64(blob), fileName, blob.type || "application/pdf");
    if (accepted === false) throw new Error("The Android app could not save this report.");
    return;
  }
  if (nativeWindow.webkit?.messageHandlers?.padleiDownload) {
    nativeWindow.webkit.messageHandlers.padleiDownload.postMessage({
      base64: await blobToBase64(blob),
      fileName,
      mimeType: blob.type || "application/pdf"
    });
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function saveAndroidReportInChunks(
  bridge: {
    beginBase64File: (transferId: string, fileName: string, mimeType: string) => boolean;
    appendBase64FileChunk: (transferId: string, chunk: string) => boolean;
    finishBase64File: (transferId: string) => boolean;
    cancelBase64File?: (transferId: string) => void;
  },
  blob: Blob,
  fileName: string
) {
  const base64 = await blobToBase64(blob);
  const transferId = `report-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const mimeType = blob.type || "application/pdf";
  const chunkSize = 128 * 1024;

  if (!bridge.beginBase64File(transferId, fileName, mimeType)) {
    throw new Error("The Android app could not prepare the report download.");
  }

  try {
    for (let offset = 0; offset < base64.length; offset += chunkSize) {
      if (!bridge.appendBase64FileChunk(transferId, base64.slice(offset, offset + chunkSize))) {
        throw new Error("The Android app could not transfer the complete report.");
      }
    }
    if (!bridge.finishBase64File(transferId)) {
      throw new Error("The Android app could not finish saving the report.");
    }
  } catch (error) {
    bridge.cancelBase64File?.(transferId);
    throw error;
  }
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not prepare the report for the mobile app."));
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.readAsDataURL(blob);
  });
}
