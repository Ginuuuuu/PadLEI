import type { Question } from "@/types/models";
import { optionKeys, questionStatus } from "@/lib/question-options";

export type ExtractedLine = {
  text: string;
  highlighted?: boolean;
  styled?: boolean;
};

export type ParsedQuestion = Omit<Question, "id" | "pdfId" | "userId">;

const tickPrefixPattern = String.raw`(?:[\u2713\u2714\u2705\u2611\u221a]\s*|\[\s*x\s*\]\s*|\(\s*x\s*\)\s*)?`;
const cyrillicOptionChars = "\u0410\u0430\u0411\u0431\u0412\u0432\u0413\u0433\u0414\u0434\u0415\u0435";
const answerValueClass = `A-F${cyrillicOptionChars}1-6`;
const optionLetterClass = `A-F${cyrillicOptionChars}`;
const optionMarkerPattern = String.raw`${tickPrefixPattern}(?:Hint\s*)?(?:\(?[${optionLetterClass}]\)?|[1-6])[\).:\-]\s*`;
const optionPrefixPattern = String.raw`${tickPrefixPattern}(?:Hint\s*)?(?:\(?([${optionLetterClass}])\)?|([1-6]))[\).:\-]\s*`;
const answerPatterns = [
  new RegExp(String.raw`(?:answer|ans|correct)\s*[:\-.)]\s*([${answerValueClass}])`, "i"),
  new RegExp(String.raw`\(([${answerValueClass}])\)\s*(?:is\s*)?(?:correct|answer)`, "i"),
  new RegExp(String.raw`(?:correct\s*option|right\s*option)\s*[:\-.)]\s*([${answerValueClass}])`, "i"),
  /\b([A-F])\s*(?:is\s*)?(?:the\s*)?(?:correct|right)\s*(?:answer|option)?\b/i
];

export function sanitizeText(input: string) {
  return input
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseMcqText(rawText: string): ParsedQuestion[] {
  const text = sanitizeText(rawText);
  const answerKey = extractAnswerKey(text);
  const lineQuestions = applyAnswerKeyToQuestions(parseMcqLines(text.split("\n").map((line) => ({ text: line }))), answerKey);
  if (hasUsableQuestionStructure(lineQuestions)) return lineQuestions;

  let blocks = text
    .split(/\n(?=\s*(?:Q\.?\s*)?\d{1,4}\s*[\).:\-]\s*)/gi)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length <= 1) {
    blocks = text
      .split(/(?=\s*(?:Q\.?\s*)?\d{1,4}\s*[\).:\-]\s*)/gi)
      .map((block) => block.trim())
      .filter(Boolean);
  }

  return blocks
    .map((block, index) => parseBlock(block, index + 1, answerKey))
    .filter((question): question is ParsedQuestion => Boolean(question));
}

export function extractAnswerKey(rawText: string) {
  const text = sanitizeText(rawText);
  const answers = new Map<number, Question["correctAnswer"]>();
  const patterns = [
    new RegExp(String.raw`(?:^|\s)(\d{1,4})\s*[\).:\-]\s*([${answerValueClass}])(?=\s*(?:$|[,;]))`, "gi"),
    new RegExp(String.raw`(?:Q\.?\s*)?(\d{1,4})\s*(?:answer|ans)\s*[:\-]\s*([${answerValueClass}])(?=\s|$|[,;])`, "gi"),
    new RegExp(String.raw`(?:answer|ans)\s*(?:for)?\s*(?:Q\.?\s*)?(\d{1,4})\s*[:\-]\s*([${answerValueClass}])(?=\s|$|[,;])`, "gi")
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const answer = toAnswerLetter(match[2]);
      if (answer) answers.set(Number(match[1]), answer);
    }
  }

  return answers;
}

export function parseMcqLines(lines: ExtractedLine[]): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  let current = null as ParsedQuestion | null;
  let lastOption: keyof ParsedQuestion["options"] | null = null;

  function startQuestion(questionNumber: number, questionText: string) {
    current = {
      questionNumber,
      questionText: cleanInlineMarkers(questionText),
      options: emptyOptions(),
      correctAnswer: "",
      explanation: "",
      status: "needsReview",
      extractionNote: ""
    };
    lastOption = null;
  }

  function finishCurrent() {
    if (!current) return;
    const hasQuestion = Boolean(current.questionText.trim());
    const hasOption = Object.values(current.options).some((value) => value.trim());
    if (hasQuestion || hasOption) {
      questions.push({
        ...current,
        status: questionStatus(current),
        extractionNote: current.correctAnswer ? current.extractionNote || "Answer detected from highlighted option." : "Answer missing. Add it manually in review."
      });
    }
    current = null;
    lastOption = null;
  }

  for (const line of lines) {
    const rawText = line.text.replace(/\s+/g, " ").trim();
    if (!rawText) continue;

    const answerLineMatch = rawText.match(/^(?:answer|ans|correct(?:\s+answer|\s+option)?)\s*[:\-.)]\s*([A-F1-6])(?=\s|$|[,;])/i);
    if (current && answerLineMatch) {
      current.correctAnswer = toAnswerLetter(answerLineMatch[1]);
      current.extractionNote = "Answer detected from text.";
      continue;
    }

    const questionMatch = rawText.match(/^(\d{1,4})\s*\.\s*(.+)/);
    const optionMatch = rawText.match(new RegExp(`^${optionPrefixPattern}(.+)`, "i"));
    const optionCount = current ? Object.values(current.options).filter(Boolean).length : 0;
    const optionKey = toAnswerLetter(optionMatch?.[1] || optionMatch?.[2]);
    const optionAlreadyFilled = Boolean(current && optionKey && current.options[optionKey]?.trim());
    const looksLikeQuestionLine = Boolean(
      questionMatch && /[?]|\b(?:identify|determine|specify|select|which|what|where|how|why|calculate|define|choose|find|state|name)\b/i.test(questionMatch[2])
    );
    const shouldStartQuestion = Boolean(
      questionMatch &&
        (!current ||
          (!optionMatch && optionCount > 0) ||
          optionAlreadyFilled ||
          (optionCount >= 3 && looksLikeQuestionLine))
    );

    if (shouldStartQuestion && questionMatch) {
      finishCurrent();
      startQuestion(Number(questionMatch[1]), questionMatch[2]);
      continue;
    }

    if (current && optionMatch) {
      const key = toAnswerLetter(optionMatch[1] || optionMatch[2]);
      if (key) {
        const optionText = cleanInlineMarkers(optionMatch[3]);
        current.options[key] = [current.options[key], optionText].filter(Boolean).join(" ").trim();
        lastOption = key;
        if (line.highlighted || line.styled || hasInlineAnswerMarker(rawText)) {
          current.correctAnswer = key;
          current.extractionNote = line.highlighted ? "Answer detected from highlighted option." : line.styled ? "Answer detected from styled option." : "Answer detected from tick/mark.";
        }
        continue;
      }
    }

    if (!current && questionMatch) {
      startQuestion(Number(questionMatch[1]), questionMatch[2]);
      continue;
    }

    if (current && lastOption) {
      current.options[lastOption] = `${current.options[lastOption]} ${cleanInlineMarkers(rawText)}`.trim();
      if (line.highlighted || line.styled || hasInlineAnswerMarker(rawText)) {
        current.correctAnswer = lastOption;
        current.extractionNote = line.highlighted ? "Answer detected from highlighted option." : line.styled ? "Answer detected from styled option." : "Answer detected from tick/mark.";
      }
    } else if (current) {
      current.questionText = `${current.questionText} ${cleanInlineMarkers(rawText)}`.trim();
    }
  }

  finishCurrent();
  return questions;
}

function parseBlock(block: string, fallbackNumber: number, answerKey: Map<number, Question["correctAnswer"]>): ParsedQuestion | null {
  const numberMatch = block.match(/^(?:Q\.?\s*)?(\d{1,4})\s*[\).:\-]\s*/i);
  const questionNumber = numberMatch ? Number(numberMatch[1]) : fallbackNumber;
  const normalized = block.replace(/^(?:Q\.?\s*)?\d{1,4}\s*[\).:\-]\s*/i, "");

  const optionRegex = new RegExp(
    String.raw`(?:^|\n|\r|(?<=\s))\s*${optionPrefixPattern}([\s\S]*?)(?=(?:\n|\r|(?<=\s))\s*${optionMarkerPattern}|(?:\n|\r|(?<=\s))\s*(?:answer|ans|correct|right)\s*[:\-.)]|(?:\n|\r|(?<=\s))\s*explanation\s*[:\-]|\s*$)`,
    "gi"
  );
  const options = emptyOptions();
  const matches = [...normalized.matchAll(optionRegex)];
  let highlightedAnswer = "" as ParsedQuestion["correctAnswer"];

  for (const match of matches) {
    const key = toAnswerLetter(match[1] || match[2]);
    if (!key) continue;
    const optionText = match[3].replace(/\n/g, " ").trim();
    if (looksHighlighted(optionText)) highlightedAnswer = key;
    options[key] = cleanOptionMarker(optionText);
  }

  const firstOptionIndex = normalized.search(
    new RegExp(String.raw`(?:^|\n|\r|(?<=\s))\s*${tickPrefixPattern}(?:Hint\s*)?(?:\(?[AАа]\)?|1)[\).:\-]\s*`, "i")
  );
  const questionText = (firstOptionIndex >= 0 ? normalized.slice(0, firstOptionIndex) : normalized).trim();
  const answerMatch = answerPatterns.map((pattern) => normalized.match(pattern)).find(Boolean);
  const correctAnswer = (toAnswerLetter(answerMatch?.[1]) || answerKey.get(questionNumber) || highlightedAnswer || "") as ParsedQuestion["correctAnswer"];
  const explanationMatch = normalized.match(/explanation\s*[:\-]\s*([\s\S]*)/i);
  const explanation = explanationMatch?.[1]?.replace(/\n/g, " ").trim() || "";
  if (!questionText && matches.length === 0) return null;

  const parsed = {
    questionNumber,
    questionText,
    options,
    correctAnswer,
    explanation,
    status: "needsReview",
    extractionNote: correctAnswer
      ? highlightedAnswer === correctAnswer
        ? "Answer detected from highlighted/marked option."
        : answerKey.has(questionNumber)
          ? "Answer detected from answer key."
          : "Answer detected from text."
      : "Answer missing. Add it manually in review."
  } satisfies ParsedQuestion;

  return { ...parsed, status: questionStatus(parsed) };
}

function applyAnswerKeyToQuestions(questions: ParsedQuestion[], answerKey: Map<number, Question["correctAnswer"]>) {
  if (!answerKey.size) return questions;

  return questions.map((question) => {
    if (question.correctAnswer) return question;
    const correctAnswer = answerKey.get(question.questionNumber);
    if (!correctAnswer) return question;
    const next = {
      ...question,
      correctAnswer,
      extractionNote: "Answer detected from answer key."
    };
    return { ...next, status: questionStatus(next) };
  });
}

function hasUsableQuestionStructure(questions: ParsedQuestion[]) {
  if (!questions.length) return false;
  const usable = questions.filter((question) => {
    const optionCount = Object.values(question.options).filter((value) => value.trim()).length;
    return question.questionText.trim() && optionCount >= 2;
  }).length;
  return usable >= Math.max(1, Math.ceil(questions.length * 0.65));
}

function emptyOptions() {
  return { A: "", B: "", C: "", D: "", E: "", F: "" };
}

function looksHighlighted(text: string) {
  return /(?:\u2713|\u2714|\u2705|\u2611|\u221a|\*|\[\s*x\s*\]|\(\s*x\s*\)|\[(?:correct|answer)\]|\bhighlighted\b)/i.test(text);
}

function cleanOptionMarker(text: string) {
  return text.replace(/(?:\u2713|\u2714|\u2705|\u2611|\u221a|\*|\[\s*x\s*\]|\(\s*x\s*\)|\[(?:correct|answer)\]|\bhighlighted\b)/gi, "").trim();
}

function hasInlineAnswerMarker(text: string) {
  return /(?:\[answer\]|\[correct\]|\[\s*x\s*\]|\(\s*x\s*\)|\bhighlighted\b|\u2713|\u2714|\u2705|\u2611|\u221a)/i.test(text);
}

function cleanInlineMarkers(text: string) {
  return cleanOptionMarker(text).replace(/\[(?:answer|correct)\]/gi, "").trim();
}

function toAnswerLetter(value?: string): Question["correctAnswer"] {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return "";
  const cyrillicOptions: Record<string, Question["correctAnswer"]> = {
    "\u0410": "A",
    "\u0411": "B",
    "\u0412": "C",
    "\u0413": "D",
    "\u0414": "E",
    "\u0415": "F"
  };
  if (cyrillicOptions[normalized]) return cyrillicOptions[normalized];
  const numericIndex = Number(normalized);
  if (Number.isInteger(numericIndex) && numericIndex >= 1 && numericIndex <= optionKeys.length) {
    return optionKeys[numericIndex - 1];
  }
  if ((optionKeys as readonly string[]).includes(normalized)) return normalized as Question["correctAnswer"];
  return "";
}
