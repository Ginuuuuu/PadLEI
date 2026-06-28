import type { ActualExamScore, ExamResult, ExamTimetableEntry } from "@/types/models";

export const semesterPresets = [
  ...Array.from({ length: 12 }, (_, index) => ({
    semesterId: `semester-${index + 1}`,
    name: `Semester ${index + 1}`
  })),
  { semesterId: "uncategorized", name: "Uncategorized" }
];

export const medicalSubjectPresets = [
  "General",
  "Anatomy",
  "Physiology",
  "Biochemistry",
  "Pathology",
  "Pharmacology",
  "Microbiology",
  "Forensic Medicine",
  "Community Medicine",
  "Internal Medicine",
  "Surgery",
  "Pediatrics",
  "Obstetrics and Gynecology",
  "Psychiatry",
  "Dermatology",
  "Radiology",
  "ENT",
  "Ophthalmology",
  "Orthopedics",
  "Anesthesiology"
] as const;

export const examTypePresets = ["AVN 1", "AVN 2", "AVN 3", "Final AVN", "Practical", "Viva"] as const;

export function normalizeAcademicName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function academicId(value: string) {
  return normalizeAcademicName(value)
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || crypto.randomUUID();
}

export function calculatePercentage(obtainedMarks: number, maximumMarks: number) {
  if (!Number.isFinite(maximumMarks) || maximumMarks <= 0) return 0;
  return Number(((obtainedMarks / maximumMarks) * 100).toFixed(2));
}

export function validateScore(input: {
  obtainedMarks: number;
  maximumMarks: number;
  passMark: number;
  examDate: string;
}) {
  if (!input.examDate || Number.isNaN(new Date(`${input.examDate}T00:00:00`).getTime())) return "Enter a valid exam date.";
  if (!Number.isFinite(input.maximumMarks) || input.maximumMarks <= 0) return "Maximum marks must be greater than zero.";
  if (!Number.isFinite(input.obtainedMarks) || input.obtainedMarks < 0) return "Obtained marks cannot be negative.";
  if (input.obtainedMarks > input.maximumMarks) return "Obtained marks cannot exceed maximum marks.";
  if (!Number.isFinite(input.passMark) || input.passMark < 0 || input.passMark > input.maximumMarks) {
    return "Pass mark must be between zero and maximum marks.";
  }
  return "";
}

export function validateTimetableEntry(entry: Pick<ExamTimetableEntry, "examDate" | "startTime" | "endTime">) {
  if (!entry.examDate || Number.isNaN(new Date(`${entry.examDate}T00:00:00`).getTime())) return "Enter a valid exam date.";
  if (!entry.startTime || !entry.endTime) return "Start and end time are required.";
  if (entry.endTime <= entry.startTime) return "End time must be after start time.";
  return "";
}

export function averagePercentage(values: number[]) {
  if (!values.length) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

export function academicSummary(scores: ActualExamScore[], mockResults: ExamResult[] = []) {
  const subjectMap = new Map<string, { subjectName: string; actual: number[]; mock: number[] }>();
  for (const score of scores) {
    const key = score.subjectId || normalizeAcademicName(score.subjectName);
    const current = subjectMap.get(key) || { subjectName: score.subjectName, actual: [], mock: [] };
    current.actual.push(score.percentage);
    subjectMap.set(key, current);
  }
  for (const result of mockResults) {
    const subjectName = result.pdfName;
    const key = normalizeAcademicName(subjectName);
    const current = subjectMap.get(key) || { subjectName, actual: [], mock: [] };
    current.mock.push(result.percentage);
    subjectMap.set(key, current);
  }

  const subjects = [...subjectMap.values()].map((subject) => ({
    subjectName: subject.subjectName,
    actualAverage: averagePercentage(subject.actual),
    mockAverage: averagePercentage(subject.mock),
    combinedAverage: averagePercentage([...subject.actual, ...subject.mock])
  }));
  const ranked = [...subjects].sort((a, b) => b.combinedAverage - a.combinedAverage);

  return {
    actualAverage: averagePercentage(scores.map((score) => score.percentage)),
    mockAverage: averagePercentage(mockResults.map((result) => result.percentage)),
    overallAverage: averagePercentage([
      ...scores.map((score) => score.percentage),
      ...mockResults.map((result) => result.percentage)
    ]),
    highestSubject: ranked[0],
    lowestSubject: ranked.at(-1),
    subjects
  };
}

export function examDateTime(entry: Pick<ExamTimetableEntry, "examDate" | "startTime">) {
  return new Date(`${entry.examDate}T${entry.startTime || "00:00"}:00`);
}

export function reminderKeys(entry: ExamTimetableEntry, now = new Date()) {
  if (entry.status !== "upcoming") return [];
  const exam = examDateTime(entry);
  const days = Math.ceil((exam.getTime() - now.getTime()) / 86_400_000);
  const thresholds = [7, 3, 1, 0];
  return thresholds
    .filter((threshold) => days === threshold)
    .map((threshold) => `${entry.examId}:${threshold}`);
}
