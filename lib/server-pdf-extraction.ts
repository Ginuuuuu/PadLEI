import { GoogleAuth } from "google-auth-library";
import { adminDb } from "@/lib/firebase-admin";
import { parseMcqLines, parseMcqText, sanitizeText, type ExtractedLine, type ParsedQuestion } from "@/lib/extraction";
import { isReadyQuestion, normalizeQuestionStatus, questionCounts } from "@/lib/question-options";
import { cloudinaryPageImageUrl, getPdfBucket, isCloudinaryImagePdfPath, isLocalPdfPath, readPdfBuffer } from "@/lib/server-pdf-storage";
import type { Question } from "@/types/models";

export async function processStoredPdf({
  pdfId,
  userId,
  storagePath,
  bucketName,
  fileUrl
}: {
  pdfId: string;
  userId: string;
  storagePath: string;
  bucketName?: string;
  fileUrl?: string;
}) {
  const buffer = await readPdfBuffer(storagePath, bucketName, fileUrl);
  return processPdfBuffer({ pdfId, userId, storagePath, bucketName, buffer });
}

export async function processPdfBuffer({
  pdfId,
  userId,
  storagePath,
  bucketName,
  buffer
}: {
  pdfId: string;
  userId: string;
  storagePath: string;
  bucketName?: string;
  buffer: Buffer;
}) {
  try {
    await adminDb.collection("pdfs").doc(pdfId).set({ status: "extracting", errorMessage: "" }, { merge: true });
    const textLines = await extractPdfTextLines(buffer);
    let text = sanitizeText(textLines.map((line) => line.text).join("\n")) || (await extractPdfText(buffer));
    let extractionSource = "PDF text";
    let parsedQuestions: ParsedQuestion[] = textLines.length ? parseMcqLines(textLines) : [];

    if (!text) {
      try {
        text = await extractRenderedOcrText(buffer);
        extractionSource = "Local page render + OCR";
      } catch (ocrError) {
        if (isCloudinaryImagePdfPath(storagePath)) {
          text = await extractCloudinaryOcrText(storagePath, bucketName, buffer);
          extractionSource = "Cloudinary page images + OCR";
        } else if (isLocalPdfPath(storagePath)) {
          throw ocrError;
        } else {
          text = await extractWithGoogleVision(storagePath, pdfId, bucketName);
          extractionSource = "Google Vision OCR";
        }
      }
    }

    if (!parsedQuestions.length && text) {
      parsedQuestions = parseMcqText(text);
    }

    let questions: Question[] = parsedQuestions.length
      ? parsedQuestions.map((question) => ({
          ...question,
          extractionNote: question.extractionNote || `Detected from ${extractionSource}.`,
          id: crypto.randomUUID(),
          pdfId,
          userId
        }))
      : [];

    if (!questions.length && text) {
      questions = fallbackReviewQuestions(text, pdfId, userId);
    }

    if (!questions.length) {
      questions = [sampleReviewQuestion(pdfId, userId, 1)];
    }

    await replaceQuestions(pdfId, questions);
    const { readyQuestions, needsReviewQuestions } = questionCounts(questions);
    await adminDb.collection("pdfs").doc(pdfId).set(
      {
        status: "completed",
        totalQuestions: questions.length,
        readyQuestions,
        needsReviewQuestions,
        errorMessage: needsReviewQuestions ? `${needsReviewQuestions} questions need review before exam.` : ""
      },
      { merge: true }
    );

    return { totalQuestions: questions.length, readyQuestions, needsReview: needsReviewQuestions };
  } catch (error) {
    const message = formatExtractionError(error);
    await adminDb.collection("pdfs").doc(pdfId).set({ status: "failed", totalQuestions: 0, readyQuestions: 0, needsReviewQuestions: 0, errorMessage: message }, { merge: true });
    throw new Error(message);
  }
}

export async function processClientExtractedQuestions({
  pdfId,
  userId,
  questions,
  source
}: {
  pdfId: string;
  userId: string;
  questions: ParsedQuestion[];
  source: string;
}) {
  try {
    await adminDb.collection("pdfs").doc(pdfId).set({ status: "extracting", errorMessage: "" }, { merge: true });
    const extractedQuestions: Question[] = questions.length
      ? questions.map((question) => {
          const id = crypto.randomUUID();
          return {
            ...question,
            id,
            questionId: question.questionId || id,
            pdfId,
            userId,
            extractionNote: question.extractionNote || `Detected from ${source}.`,
            confidence: typeof question.confidence === "number" ? question.confidence : isReadyQuestion(question) ? 0.9 : 0.45
          };
        })
      : [sampleReviewQuestion(pdfId, userId, 1)];

    await replaceQuestions(pdfId, extractedQuestions);
    const { readyQuestions, needsReviewQuestions } = questionCounts(extractedQuestions);
    await adminDb.collection("pdfs").doc(pdfId).set(
      {
        status: "completed",
        totalQuestions: extractedQuestions.length,
        readyQuestions,
        needsReviewQuestions,
        errorMessage: needsReviewQuestions ? `${needsReviewQuestions} questions need review before exam.` : ""
      },
      { merge: true }
    );

    return { totalQuestions: extractedQuestions.length, readyQuestions, needsReview: needsReviewQuestions };
  } catch (error) {
    const message = formatExtractionError(error);
    await adminDb.collection("pdfs").doc(pdfId).set({ status: "failed", totalQuestions: 0, readyQuestions: 0, needsReviewQuestions: 0, errorMessage: message }, { merge: true });
    throw new Error(message);
  }
}

export function formatExtractionError(error: unknown) {
  const message = error instanceof Error ? error.message : "Extraction failed.";
  return message.length > 700 ? `${message.slice(0, 700)}...` : message;
}

async function replaceQuestions(pdfId: string, questions: Question[]) {
  const existing = await adminDb.collection("questions").where("pdfId", "==", pdfId).get();
  const writer = adminDb.bulkWriter();
  existing.docs.forEach((item) => writer.delete(item.ref));
  questions.forEach((question) => writer.set(adminDb.collection("questions").doc(question.id), normalizeQuestion(question)));
  await writer.close();
}

function normalizeQuestion(question: Question): Question {
  return {
    id: question.id,
    questionId: question.questionId || question.id,
    pdfId: question.pdfId,
    userId: question.userId,
    questionNumber: Number.isFinite(question.questionNumber) ? question.questionNumber : 0,
    questionText: question.questionText || "",
    options: {
      A: question.options?.A || "",
      B: question.options?.B || "",
      C: question.options?.C || "",
      D: question.options?.D || "",
      E: question.options?.E || "",
      F: question.options?.F || ""
    },
    correctAnswer: question.correctAnswer || "",
    explanation: question.explanation || "",
    status: normalizeQuestionStatus(isReadyQuestion(question) ? "ready" : question.status),
    confidence: typeof question.confidence === "number" ? question.confidence : isReadyQuestion(question) ? 0.92 : 0.45,
    extractionNote: question.extractionNote || ""
  };
}

async function extractPdfText(buffer: Buffer) {
  const attempts = [extractWithPdfParse, extractWithPdfJs];

  for (const attempt of attempts) {
    try {
      const text = sanitizeText(await attempt(buffer));
      if (text.length > 20) return text;
    } catch {
      // Try the next PDF reader.
    }
  }

  return "";
}

async function extractWithPdfParse(buffer: Buffer) {
  const pdfParse = (await import("pdf-parse")).default;
  const parsed = await pdfParse(buffer);
  return parsed.text || "";
}

async function extractPdfTextLines(buffer: Buffer): Promise<ExtractedLine[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");
  const document = await pdfjs.getDocument(
    {
      data: new Uint8Array(buffer),
      disableWorker: true,
      isEvalSupported: false,
      useSystemFonts: true
    } as unknown as Parameters<typeof pdfjs.getDocument>[0]
  ).promise;
  const lines: ExtractedLine[] = [];
  const scale = 2;

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const textItems: PdfTextItem[] = [];
    for (const item of content.items) {
      if (isPdfTextItem(item)) textItems.push(item);
    }
    if (!textItems.length) continue;

    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport
    }).promise;
    const image = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const grouped = groupPdfTextItems(textItems, viewport, scale);

    for (const group of grouped) {
      const text = buildLineText(group.items);
      if (!text) continue;
      lines.push({
        text,
        highlighted: detectYellowHighlight(group, image, canvas.width, canvas.height),
        styled: detectStyledAnswerMarker(group)
      });
    }
  }

  return lines;
}

type PdfLineGroup = {
  y: number;
  items: Array<{
    text: string;
    x0: number;
    x1: number;
    yTop: number;
    yBottom: number;
    skew: number;
    fontName?: string;
  }>;
};

type PdfTextItem = {
  str: string;
  width?: number;
  height?: number;
  transform: number[];
  fontName?: string;
};

function isPdfTextItem(item: unknown): item is PdfTextItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    typeof (item as { str?: unknown }).str === "string" &&
    Boolean((item as { str: string }).str.trim()) &&
    Array.isArray((item as { transform?: unknown }).transform)
  );
}

function groupPdfTextItems(
  items: PdfTextItem[],
  viewport: { convertToViewportPoint: (x: number, y: number) => number[] },
  scale: number
) {
  const groups: PdfLineGroup[] = [];

  for (const item of items) {
    const text = item.str;
    if (!text.trim()) continue;
    const pdfX = item.transform[4];
    const pdfY = item.transform[5];
    let group = groups.find((candidate) => Math.abs(candidate.y - pdfY) < 3);
    if (!group) {
      group = { y: pdfY, items: [] };
      groups.push(group);
    }
    const [x, baselineY] = viewport.convertToViewportPoint(pdfX, pdfY);
    const height = (item.height || Math.abs(item.transform[3]) || 12) * scale;
    const width = (item.width || 0) * scale;
    group.items.push({
      text,
      x0: x,
      x1: x + width,
      yTop: baselineY - height,
      yBottom: baselineY + 4,
      skew: item.transform[2] || 0,
      fontName: item.fontName
    });
  }

  return groups.sort((a, b) => b.y - a.y).map((group) => ({ ...group, items: group.items.sort((a, b) => a.x0 - b.x0) }));
}

function buildLineText(items: PdfLineGroup["items"]) {
  let text = "";
  let previousX = 0;

  for (const item of items) {
    const gap = item.x0 - previousX;
    if (text && gap > 5 && !text.endsWith(" ") && !item.text.startsWith(" ")) text += " ";
    text += item.text;
    previousX = item.x1;
  }

  return text.replace(/\s+/g, " ").trim();
}

function detectYellowHighlight(group: PdfLineGroup, image: Uint8ClampedArray, width: number, height: number) {
  const x0 = Math.max(0, Math.floor(Math.min(...group.items.map((item) => item.x0)) - 4));
  const x1 = Math.min(width - 1, Math.ceil(Math.max(...group.items.map((item) => item.x1)) + 4));
  const y0 = Math.max(0, Math.floor(Math.min(...group.items.map((item) => item.yTop)) - 3));
  const y1 = Math.min(height - 1, Math.ceil(Math.max(...group.items.map((item) => item.yBottom)) + 3));
  let yellow = 0;
  let total = 0;

  for (let y = y0; y <= y1; y += 2) {
    for (let x = x0; x <= x1; x += 2) {
      const index = (y * width + x) * 4;
      total += 1;
      if (isYellowPixel(image[index], image[index + 1], image[index + 2], image[index + 3])) yellow += 1;
    }
  }

  return yellow / Math.max(1, total) > 0.25;
}

function detectStyledAnswerMarker(group: PdfLineGroup) {
  const text = buildLineText(group.items);
  if (!/^(?:[\u2713\u2714\u2705\u2611\u221a]\s*|\[\s*x\s*\]\s*|\(\s*x\s*\)\s*)?(?:Hint\s*)?(?:\(?[A-F]\)?|[1-6])[\).:\-]/i.test(text)) return false;
  return group.items.some((item) => Math.abs(item.skew) > 0.5 || /italic|oblique/i.test(item.fontName || ""));
}

function isYellowPixel(red: number, green: number, blue: number, alpha: number) {
  return alpha > 0 && red > 170 && green > 150 && blue < 120 && red >= green - 30;
}

async function extractWithPdfJs(buffer: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument(
    {
      data: new Uint8Array(buffer),
      disableWorker: true,
      isEvalSupported: false,
      useSystemFonts: true
    } as unknown as Parameters<typeof pdfjs.getDocument>[0]
  ).promise;

  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join("\n");
    pages.push(text);
  }

  return pages.join("\n\n");
}

async function countPdfPages(buffer: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument(
    {
      data: new Uint8Array(buffer),
      disableWorker: true,
      isEvalSupported: false,
      useSystemFonts: true
    } as unknown as Parameters<typeof pdfjs.getDocument>[0]
  ).promise;

  return document.numPages;
}

async function extractRenderedOcrText(buffer: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");
  const { createWorker } = await import("tesseract.js");
  const document = await pdfjs.getDocument(
    {
      data: new Uint8Array(buffer),
      disableWorker: true,
      isEvalSupported: false,
      useSystemFonts: true
    } as unknown as Parameters<typeof pdfjs.getDocument>[0]
  ).promise;
  const maxPages = Number(process.env.OCR_MAX_PAGES || 60);
  const pagesToScan = Math.min(document.numPages, maxPages);
  const scale = Number(process.env.OCR_RENDER_SCALE || 2);
  const worker = await createWorker("eng");
  const texts: string[] = [];

  try {
    await worker.setParameters({
      preserve_interword_spaces: "1"
    });

    for (let pageNumber = 1; pageNumber <= pagesToScan; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext("2d");
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport
      }).promise;
      const result = await worker.recognize(canvas.toBuffer("image/png"));
      if (result.data.text) texts.push(result.data.text);
    }
  } finally {
    await worker.terminate();
  }

  const text = sanitizeText(texts.join("\n\n"));
  if (!text) throw new Error("OCR finished, but no readable text was found in this scanned PDF.");
  if (document.numPages > maxPages) {
    return `${text}\n\nOCR note: only the first ${maxPages} pages were scanned.`;
  }
  return text;
}

async function extractCloudinaryOcrText(storagePath: string, cloudName: string | undefined, buffer: Buffer) {
  const pageCount = await countPdfPages(buffer);
  const maxPages = Number(process.env.OCR_MAX_PAGES || 60);
  const pagesToScan = Math.min(pageCount, maxPages);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  const texts: string[] = [];

  try {
    await worker.setParameters({
      preserve_interword_spaces: "1"
    });

    for (let pageNumber = 1; pageNumber <= pagesToScan; pageNumber += 1) {
      const imageResponse = await fetch(cloudinaryPageImageUrl(storagePath, pageNumber, cloudName));
      if (!imageResponse.ok) {
        throw new Error(
          `Cloudinary page render failed on page ${pageNumber}: ${imageResponse.statusText}. Enable PDF delivery in Cloudinary Security settings for scanned-PDF OCR.`
        );
      }
      const image = Buffer.from(await imageResponse.arrayBuffer());
      const result = await worker.recognize(image);
      if (result.data.text) texts.push(result.data.text);
    }
  } finally {
    await worker.terminate();
  }

  const text = sanitizeText(texts.join("\n\n"));
  if (!text) throw new Error("OCR finished, but no readable text was found in this scanned PDF.");
  if (pageCount > maxPages) {
    return `${text}\n\nOCR note: only the first ${maxPages} pages were scanned.`;
  }
  return text;
}

async function extractWithGoogleVision(storagePath: string, pdfId: string, bucketName?: string) {
  const bucket = getPdfBucket(bucketName);
  const resolvedBucketName = bucket.name;
  const serviceAccountPath = process.env.VERCEL ? undefined : process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_PATH;
  if (!resolvedBucketName) throw new Error("OCR setup is incomplete: Firebase Storage bucket is missing.");

  const auth = new GoogleAuth({
    keyFile: serviceAccountPath,
    credentials:
      process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY
        ? {
            project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
            client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
            private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n")
          }
        : undefined,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"]
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("OCR setup is incomplete: Google service account token could not be created.");

  const outputPrefix = `ocr-output/${pdfId}/`;
  const startResponse = await fetch("https://vision.googleapis.com/v1/files:asyncBatchAnnotate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      requests: [
        {
          inputConfig: {
            gcsSource: { uri: `gs://${resolvedBucketName}/${storagePath}` },
            mimeType: "application/pdf"
          },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          outputConfig: {
            gcsDestination: { uri: `gs://${resolvedBucketName}/${outputPrefix}` },
            batchSize: 5
          }
        }
      ]
    })
  });

  if (!startResponse.ok) {
    const errorText = await startResponse.text();
    throw new Error(`OCR failed to start: ${errorText}`);
  }

  const operation = (await startResponse.json()) as { name?: string };
  if (!operation.name) throw new Error("OCR failed to start: Google Vision did not return an operation id.");

  let completed = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const statusResponse = await fetch(`https://vision.googleapis.com/v1/${operation.name}`, {
      headers: { Authorization: `Bearer ${token.token}` }
    });
    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      throw new Error(`OCR status check failed: ${errorText}`);
    }
    const status = (await statusResponse.json()) as { done?: boolean; error?: { message?: string } };
    if (status.error?.message) throw new Error(`OCR failed: ${status.error.message}`);
    if (status.done) {
      completed = true;
      break;
    }
  }

  if (!completed) {
    throw new Error("OCR timed out before Google Vision finished scanning this PDF. Try a smaller PDF or retry the scan.");
  }

  const [files] = await bucket.getFiles({ prefix: outputPrefix });
  const texts: string[] = [];

  for (const file of files.filter((item) => item.name.endsWith(".json"))) {
    const [contents] = await file.download();
    const payload = JSON.parse(contents.toString("utf8")) as {
      responses?: Array<{ fullTextAnnotation?: { text?: string } }>;
    };
    for (const response of payload.responses || []) {
      if (response.fullTextAnnotation?.text) texts.push(response.fullTextAnnotation.text);
    }
  }

  await Promise.all(files.map((file) => file.delete().catch(() => undefined)));
  const text = sanitizeText(texts.join("\n\n"));
  if (!text) {
    throw new Error("OCR finished, but no readable text was found in this PDF.");
  }
  return text;
}

function fallbackReviewQuestions(text: string, pdfId: string, userId: string): Question[] {
  const chunks = text
    .split(/(?=(?:^|\n|\s)(?:Q\.?\s*)?\d{1,4}[\).:\-]\s+)/i)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .slice(0, 50);

  const usable = chunks.length ? chunks : [text.slice(0, 1200)];

  return usable.map((chunk, index) => ({
    id: crypto.randomUUID(),
    pdfId,
    userId,
    questionNumber: index + 1,
    questionText: chunk || "Question text needs manual review.",
    options: { A: "", B: "", C: "", D: "", E: "", F: "" },
    correctAnswer: "",
    explanation: "",
    status: "needsReview",
    confidence: 0.25,
    extractionNote: "Could not confidently detect MCQ options. Review and complete manually."
  }));
}

function sampleReviewQuestion(pdfId: string, userId: string, number: number): Question {
  return {
    id: crypto.randomUUID(),
    pdfId,
    userId,
    questionNumber: number,
    questionText: "OCR review needed: scanned PDF text could not be extracted automatically.",
    options: { A: "", B: "", C: "", D: "", E: "", F: "" },
    correctAnswer: "",
    explanation: "Use the review screen to enter the question manually.",
    status: "needsReview",
    confidence: 0.1,
    extractionNote: "No selectable text was found in this PDF."
  };
}
