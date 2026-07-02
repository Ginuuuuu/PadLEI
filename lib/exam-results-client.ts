"use client";

import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { ExamResult, Question } from "@/types/models";

const requestTimeoutMs = 15_000;
const maximumSubmitAttempts = 2;
const transientStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function submitExamResult(result: ExamResult) {
  const transferResult = compactResultForTransfer(result);
  let lastError: unknown;

  for (let attempt = 0; attempt < maximumSubmitAttempts; attempt += 1) {
    try {
      const response = await authorizedRequest("/api/exam-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result: transferResult })
      }, attempt > 0);
      const payload = (await response.json().catch(() => ({}))) as { error?: string; resultId?: string };
      if (response.ok && payload.resultId) return payload.resultId;
      const error = new ExamResultRequestError(payload.error || "Could not submit this exam.", response.status);
      const retryableAuthError = (response.status === 401 || response.status === 403) && attempt === 0;
      if ((!transientStatuses.has(response.status) && !retryableAuthError) || attempt === maximumSubmitAttempts - 1) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (error instanceof ExamResultRequestError && !transientStatuses.has(error.status)) throw error;
      if (attempt === maximumSubmitAttempts - 1) break;
    }
    await wait(700 * (attempt + 1));
  }

  throw lastError instanceof Error ? lastError : new Error("Could not submit this exam.");
}

export async function loadExamResult(resultId: string) {
  const response = await authorizedRequest(`/api/exam-results?resultId=${encodeURIComponent(resultId)}`, {
    method: "GET",
    cache: "no-store"
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string; result?: ExamResult };
  if (!response.ok || !payload.result) {
    throw new ExamResultRequestError(payload.error || "Could not load this exam result.", response.status);
  }
  return payload.result;
}

export async function hydrateExamResultDiagrams(result: ExamResult) {
  const missing = result.questions.filter((question) => question.diagrams?.some((diagram) => !diagram.src));
  if (!missing.length) return result;

  const diagramsByQuestion = new Map<string, Question["diagrams"]>();
  for (let index = 0; index < missing.length; index += 20) {
    const group = missing.slice(index, index + 20);
    const snapshots = await Promise.all(group.map((question) => getDoc(doc(db, "questions", question.id))));
    snapshots.forEach((snapshot, snapshotIndex) => {
      if (!snapshot.exists()) return;
      const source = snapshot.data() as Question;
      if (source.diagrams?.length) diagramsByQuestion.set(group[snapshotIndex].id, source.diagrams);
    });
  }

  if (!diagramsByQuestion.size) return result;
  return {
    ...result,
    questions: result.questions.map((question) => {
      const diagrams = diagramsByQuestion.get(question.id);
      return diagrams ? { ...question, diagrams } : question;
    })
  };
}

function compactResultForTransfer(result: ExamResult): ExamResult {
  return {
    ...result,
    questions: result.questions.map((question) => ({
      ...question,
      diagrams: (question.diagrams || []).map((diagram) => ({
        ...diagram,
        src: /^https:\/\//i.test(diagram.src) && diagram.src.length <= 2_000 ? diagram.src : ""
      }))
    }))
  };
}

async function authorizedRequest(url: string, init: RequestInit, forceRefresh = false) {
  const user = auth.currentUser;
  if (!user) throw new ExamResultRequestError("Your login has expired. Sign in again.", 401);

  const token = await user.getIdToken(forceRefresh);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(url, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`
      },
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ExamResultRequestError("The request timed out.", 408);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

class ExamResultRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
