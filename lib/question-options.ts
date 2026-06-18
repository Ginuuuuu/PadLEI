import type { OptionKey, Question } from "@/types/models";

export const optionKeys = ["A", "B", "C", "D", "E", "F"] as const satisfies readonly OptionKey[];

export function getVisibleOptionKeys(question: Question) {
  return optionKeys.filter((key) => Boolean(question.options?.[key]?.trim()));
}

export function hasUsableOptions(question: Pick<Question, "options" | "correctAnswer">) {
  const visible = optionKeys.filter((key) => Boolean(question.options?.[key]?.trim()));
  return visible.length >= 2 && Boolean(question.correctAnswer && question.options?.[question.correctAnswer]?.trim());
}

export function questionStatus(question: Pick<Question, "questionText" | "options" | "correctAnswer">) {
  return question.questionText?.trim() && hasUsableOptions(question) ? "ready" : "needs_review";
}
