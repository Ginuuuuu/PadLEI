import type { OptionKey, Question, QuestionStatus } from "@/types/models";
import { shuffle } from "@/lib/utils";

export const optionKeys = ["A", "B", "C", "D", "E", "F"] as const satisfies readonly OptionKey[];

export function getVisibleOptionKeys(question: Question) {
  return optionKeys.filter((key) => Boolean(question.options?.[key]?.trim()));
}

export function getDisplayOptionKeys(question: Question, _shuffleChoices = false) {
  return getVisibleOptionKeys(question);
}

export function getDisplayOptions(question: Question, shuffleChoices = false) {
  const displayKeys = getVisibleOptionKeys(question);
  const sourceKeys = shuffleChoices ? shuffledContentKeys(displayKeys) : displayKeys;

  return displayKeys.map((displayKey, index) => {
    const optionKey = sourceKeys[index] || displayKey;
    return {
      displayKey,
      optionKey,
      text: question.options?.[optionKey] || ""
    };
  });
}

function shuffledContentKeys(keys: OptionKey[]) {
  if (keys.length <= 1) return keys;
  const shuffled = shuffle(keys);
  const stayedInOrder = shuffled.every((key, index) => key === keys[index]);
  return stayedInOrder ? [...shuffled.slice(1), shuffled[0]] : shuffled;
}

export function hasUsableOptions(question: Pick<Question, "options" | "correctAnswer">) {
  const visible = optionKeys.filter((key) => Boolean(question.options?.[key]?.trim()));
  return visible.length >= 2 && Boolean(question.correctAnswer && question.options?.[question.correctAnswer]?.trim());
}

export function questionStatus(question: Pick<Question, "questionText" | "options" | "correctAnswer">): QuestionStatus {
  return question.questionText?.trim() && hasUsableOptions(question) ? "ready" : "needsReview";
}

export function isReadyQuestion(question: Pick<Question, "status" | "questionText" | "options" | "correctAnswer">) {
  return question.status ? question.status === "ready" : questionStatus(question) === "ready";
}

export function isNeedsReviewStatus(status?: QuestionStatus | string) {
  return status === "needsReview" || status === "needs_review" || status === "failed";
}

export function normalizeQuestionStatus(status?: QuestionStatus | string) {
  if (status === "ready") return "ready";
  if (status === "failed") return "failed";
  return "needsReview";
}

export function questionCounts(questions: Question[]) {
  const readyQuestions = questions.filter(isReadyQuestion).length;
  const needsReviewQuestions = questions.length - readyQuestions;
  return { readyQuestions, needsReviewQuestions };
}
