import type { ExamSettings } from "@/types/models";

export type ExamDraft = {
  version: 1;
  resultId: string;
  ownerId: string;
  pdfId: string;
  settings: ExamSettings;
  questionIds: string[];
  currentQuestionId?: string;
  optionOrderByQuestion: Record<string, string[]>;
  selected: Record<string, string>;
  marked: Record<string, boolean>;
  startedAt: number;
  updatedAt: number;
};

const draftVersion = 1;
const maximumDraftAgeMs = 7 * 24 * 60 * 60 * 1000;

export function readExamDraft(ownerId: string, pdfId: string): ExamDraft | null {
  if (typeof window === "undefined" || !ownerId || !pdfId) return null;
  try {
    const raw = window.localStorage.getItem(draftKey(ownerId, pdfId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as ExamDraft;
    const valid = draft.version === draftVersion
      && draft.ownerId === ownerId
      && draft.pdfId === pdfId
      && draft.settings?.pdfId === pdfId
      && Array.isArray(draft.questionIds)
      && draft.questionIds.length > 0
      && Date.now() - draft.updatedAt <= maximumDraftAgeMs;
    if (valid) return draft;
    window.localStorage.removeItem(draftKey(ownerId, pdfId));
  } catch {
    // A corrupt or unavailable local draft should never block the exam.
  }
  return null;
}

export function saveExamDraft(draft: Omit<ExamDraft, "version" | "updatedAt">) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(draftKey(draft.ownerId, draft.pdfId), JSON.stringify({
      ...draft,
      version: draftVersion,
      updatedAt: Date.now()
    } satisfies ExamDraft));
  } catch {
    // The exam remains usable even if private browsing blocks local storage.
  }
}

export function clearExamDraft(ownerId: string, pdfId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(draftKey(ownerId, pdfId));
  } catch {
    // Nothing else is required when storage is unavailable.
  }
}

function draftKey(ownerId: string, pdfId: string) {
  return `padlei-exam-draft:${ownerId}:${pdfId}`;
}
