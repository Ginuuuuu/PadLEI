import type {
  ExamAnswer,
  ExamResult,
  ExamResultDetailChunk,
  ExamResultDetailItem,
  Question,
  StoredExamResult
} from "@/types/models";

const schemaVersion = 2;
const targetChunkBytes = 300_000;
const maxQuestionsPerResult = 2_000;
const resultIdPattern = /^[a-zA-Z0-9_-]{10,100}$/;

export class ExamResultValidationError extends Error {}

export function prepareExamResultForStorage(result: ExamResult, ownerId: string) {
  if (!resultIdPattern.test(result.resultId)) throw new ExamResultValidationError("The exam result id is invalid.");
  if (!result.pdfId || !result.pdfName) throw new ExamResultValidationError("The exam source is missing.");
  if (!Array.isArray(result.questions) || !result.questions.length) throw new ExamResultValidationError("The exam has no questions.");
  if (result.questions.length > maxQuestionsPerResult) throw new ExamResultValidationError("This exam contains too many questions.");
  if (!Array.isArray(result.answers)) throw new ExamResultValidationError("The exam answers are missing.");

  const answers = new Map(result.answers.map((answer) => [answer.questionId, normalizeAnswer(answer)]));
  const items = result.questions.map((question) => {
    const normalizedQuestion = normalizeQuestion(question, ownerId);
    const answer = answers.get(normalizedQuestion.id);
    if (!normalizedQuestion.id) throw new ExamResultValidationError(`Question ${normalizedQuestion.questionNumber} has no id.`);
    if (!answer) throw new ExamResultValidationError(`Answer data is missing for question ${normalizedQuestion.questionNumber}.`);
    return { question: normalizedQuestion, answer } satisfies ExamResultDetailItem;
  });
  const chunks = chunkExamResultItems(result.resultId, ownerId, items);
  const attempted = items.filter((item) => Boolean(item.answer.selectedAnswer)).length;
  const correct = items.filter((item) => item.answer.selectedAnswer && item.answer.selectedAnswer === item.answer.correctAnswer).length;
  const wrong = attempted - correct;

  const summary: StoredExamResult = {
    resultId: result.resultId,
    userId: ownerId,
    pdfId: result.pdfId.slice(0, 200),
    pdfName: result.pdfName.slice(0, 300),
    date: validDate(result.date) ? result.date : new Date().toISOString(),
    totalQuestions: items.length,
    attempted,
    correct,
    wrong,
    unattempted: items.length - attempted,
    marks: finiteNumber(result.marks),
    percentage: clamp(finiteNumber(result.percentage), 0, 100),
    timeTaken: clamp(Math.round(finiteNumber(result.timeTaken)), 0, 604_800),
    schemaVersion,
    detailChunkCount: chunks.length
  };

  return { summary, chunks };
}

export function hydrateStoredExamResult(summary: StoredExamResult, chunks: ExamResultDetailChunk[]): ExamResult {
  if (Array.isArray(summary.questions) && Array.isArray(summary.answers)) {
    return summary as ExamResult;
  }

  const items = [...chunks]
    .sort((left, right) => left.index - right.index)
    .flatMap((chunk) => chunk.items || []);

  return {
    ...summary,
    answers: items.map((item) => item.answer),
    questions: items.map((item) => item.question)
  } as ExamResult;
}

function chunkExamResultItems(resultId: string, ownerId: string, items: ExamResultDetailItem[]) {
  const chunks: ExamResultDetailChunk[] = [];
  let current: ExamResultDetailItem[] = [];

  for (const item of items) {
    const candidate = [...current, item];
    if (current.length && jsonBytes(candidate) > targetChunkBytes) {
      chunks.push(createChunk(resultId, ownerId, chunks.length, current));
      current = [item];
    } else {
      current = candidate;
    }
  }

  if (current.length) chunks.push(createChunk(resultId, ownerId, chunks.length, current));
  return chunks;
}

function createChunk(resultId: string, ownerId: string, index: number, items: ExamResultDetailItem[]) {
  return { resultId, userId: ownerId, index, items } satisfies ExamResultDetailChunk;
}

function normalizeQuestion(question: Question, ownerId: string): Question {
  const diagrams = (question.diagrams || []).map((diagram) => ({
    ...diagram,
    src: /^https:\/\//i.test(diagram.src) && diagram.src.length <= 2_000 ? diagram.src : ""
  }));

  return JSON.parse(JSON.stringify({
    ...question,
    id: String(question.id || question.questionId || ""),
    questionId: String(question.questionId || question.id || ""),
    userId: ownerId,
    pdfId: String(question.pdfId || ""),
    questionNumber: Math.max(1, Math.round(finiteNumber(question.questionNumber))),
    questionText: String(question.questionText || ""),
    options: {
      A: String(question.options?.A || ""),
      B: String(question.options?.B || ""),
      C: String(question.options?.C || ""),
      D: String(question.options?.D || ""),
      ...(question.options?.E ? { E: String(question.options.E) } : {}),
      ...(question.options?.F ? { F: String(question.options.F) } : {})
    },
    correctAnswer: question.correctAnswer || "",
    diagrams
  })) as Question;
}

function normalizeAnswer(answer: ExamAnswer): ExamAnswer {
  return {
    questionId: String(answer.questionId || ""),
    selectedAnswer: String(answer.selectedAnswer || ""),
    selectedDisplayAnswer: String(answer.selectedDisplayAnswer || ""),
    selectedAnswerText: String(answer.selectedAnswerText || ""),
    correctAnswer: String(answer.correctAnswer || ""),
    correctDisplayAnswer: String(answer.correctDisplayAnswer || ""),
    correctAnswerText: String(answer.correctAnswerText || ""),
    isCorrect: Boolean(answer.selectedAnswer && answer.selectedAnswer === answer.correctAnswer),
    markedForReview: Boolean(answer.markedForReview)
  };
}

function jsonBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function validDate(value: string) {
  return Boolean(value) && !Number.isNaN(Date.parse(value));
}

function finiteNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
