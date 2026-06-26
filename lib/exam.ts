import type { ExamAnswer, ExamResult, ExamSettings, Question } from "@/types/models";
import { isReadyQuestion } from "@/lib/question-options";
import { shuffle } from "@/lib/utils";

type DisplayOptionSnapshot = {
  displayKey: string;
  optionKey: string;
  text: string;
};

export function buildExamQuestions(questions: Question[], settings: ExamSettings) {
  const inRange = questions
    .filter((question) => question.questionNumber >= settings.fromQuestion && question.questionNumber <= settings.toQuestion)
    .filter(isReadyQuestion);

  const ordered = settings.order === "random" ? shuffle(inRange) : inRange.sort((a, b) => a.questionNumber - b.questionNumber);
  return ordered.slice(0, settings.questionCount);
}

export function scoreExam(params: {
  userId: string;
  questions: Question[];
  selected: Record<string, string>;
  marked: Record<string, boolean>;
  settings: ExamSettings;
  timeTaken: number;
  displayOptionsByQuestion?: Record<string, DisplayOptionSnapshot[]>;
}): Omit<ExamResult, "resultId" | "date"> {
  const answers: ExamAnswer[] = params.questions.map((question) => {
    const selectedAnswer = params.selected[question.id] || "";
    const displayOptions = params.displayOptionsByQuestion?.[question.id] || [];
    const selectedDisplayOption = displayOptions.find((option) => option.optionKey === selectedAnswer);
    const correctDisplayOption = displayOptions.find((option) => option.optionKey === question.correctAnswer);

    return {
      questionId: question.id,
      selectedAnswer,
      selectedDisplayAnswer: selectedDisplayOption?.displayKey || selectedAnswer,
      selectedAnswerText: selectedDisplayOption?.text || optionText(question, selectedAnswer),
      correctAnswer: question.correctAnswer,
      correctDisplayAnswer: correctDisplayOption?.displayKey || question.correctAnswer,
      correctAnswerText: correctDisplayOption?.text || optionText(question, question.correctAnswer),
      isCorrect: selectedAnswer === question.correctAnswer,
      markedForReview: Boolean(params.marked[question.id])
    };
  });

  const attempted = answers.filter((answer) => answer.selectedAnswer).length;
  const correct = answers.filter((answer) => answer.isCorrect).length;
  const wrong = attempted - correct;
  const unattempted = params.questions.length - attempted;
  const penalty = params.settings.negativeMarks ? wrong * params.settings.negativeValue : 0;
  const marks = correct * params.settings.marksPerCorrect - penalty;
  const maxMarks = params.questions.length * params.settings.marksPerCorrect;
  const percentage = maxMarks > 0 ? Math.max(0, Math.round((marks / maxMarks) * 100)) : 0;

  return {
    userId: params.userId,
    pdfId: params.settings.pdfId,
    pdfName: params.settings.pdfName,
    totalQuestions: params.questions.length,
    attempted,
    correct,
    wrong,
    unattempted,
    marks,
    percentage,
    timeTaken: params.timeTaken,
    answers,
    questions: params.questions
  };
}

export function gradeFromPercentage(percentage: number) {
  if (percentage >= 85) return "Excellent";
  if (percentage >= 70) return "Strong";
  if (percentage >= 50) return "Improving";
  return "Needs revision";
}

function optionText(question: Question, optionKey: string) {
  if (!optionKey) return "";
  return question.options?.[optionKey as keyof Question["options"]]?.trim() || "";
}
