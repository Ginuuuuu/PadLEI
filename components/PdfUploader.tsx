"use client";

import { useState } from "react";
import { FileUp } from "lucide-react";
import toast from "react-hot-toast";
import { auth } from "@/lib/firebase";
import { parseMcqLines, parseMcqText, sanitizeText, type ExtractedLine, type ParsedQuestion } from "@/lib/extraction";
import { useAuth } from "@/components/AuthProvider";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { medicalSubjectPresets } from "@/lib/academic";
import { useAcademicCatalog } from "@/lib/use-academic-catalog";

const maxSizeMb = 20;
const vercelSafeFallbackMb = 4;
const maxBrowserDiagramPayloadChars = 1_800_000;

type UploadResult = {
  pdfId?: string;
  storagePath?: string;
  bucketName?: string;
  localFallback?: boolean;
  totalQuestions?: number;
  readyQuestions?: number;
  needsReview?: number;
  extractionError?: string;
  error?: string;
};

type CloudinarySignature = {
  pdfId: string;
  apiKey: string;
  bucketName: string;
  cloudName: string;
  publicId: string;
  signature: string;
  storagePath: string;
  timestamp: number;
  uploadUrl: string;
  error?: string;
};

type CloudinaryUpload = {
  secure_url?: string;
  error?: { message?: string };
};

type BrowserExtraction = {
  questions: ParsedQuestion[];
  source: string;
};

type BrowserPdfTextItem = {
  str: string;
  width?: number;
  height?: number;
  transform: number[];
  fontName?: string;
};

type BrowserLineGroup = {
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

type BrowserRenderedPage = {
  pageNumber: number;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
  image: Uint8ClampedArray;
};

async function readPayload<T extends { error?: string }>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text.slice(0, 500) } as T;
  }
}

export function PdfUploader() {
  const { appUser } = useAuth();
  const { semesters, subjects, addSubject } = useAcademicCatalog();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"idle" | "uploading" | "extracting">("idle");
  const [semesterId, setSemesterId] = useState("uncategorized");
  const [subjectName, setSubjectName] = useState("General");

  async function handleUpload(file?: File) {
    if (!file || !appUser) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) return toast.error("Only PDF files are allowed.");
    if (file.size > maxSizeMb * 1024 * 1024) return toast.error(`PDF must be under ${maxSizeMb} MB.`);

    setBusy(true);

    try {
      const semester = semesters.find((item) => item.semesterId === semesterId);
      if (!semester) throw new Error("Choose a valid semester.");
      const subject = await addSubject(
        semester,
        subjectName,
        !medicalSubjectPresets.includes(subjectName as typeof medicalSubjectPresets[number])
      );
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Login required.");

      setStage("extracting");
      let browserExtraction: BrowserExtraction;
      try {
        browserExtraction = await extractQuestionsInBrowser(file);
      } catch (error) {
        browserExtraction = {
          questions: [],
          source: `browser PDF extraction unavailable: ${error instanceof Error ? error.message : "unknown error"}`
        };
      }

      setStage("uploading");
      const directUpload = await requestCloudinarySignature(file, token);
      if (directUpload) {
        const cloudinaryUpload = await uploadDirectlyToCloudinary(file, directUpload);
        setStage("extracting");
        const uploaded = await completeCloudinaryUpload(
          file,
          token,
          directUpload,
          cloudinaryUpload.secure_url || "",
          browserExtraction,
          {
            semesterId: semester.semesterId,
            semesterName: semester.name,
            subjectId: subject.subjectId,
            subjectName: subject.name
          }
        );
        showUploadResult(uploaded);
        return;
      }

      setStage("extracting");
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      uploadForm.append("semesterId", semester.semesterId);
      uploadForm.append("semesterName", semester.name);
      uploadForm.append("subjectId", subject.subjectId);
      uploadForm.append("subjectName", subject.name);

      const uploadController = new AbortController();
      const uploadTimeout = window.setTimeout(() => uploadController.abort(), 300000);
      const uploadResponse = await fetch("/api/upload-pdf", {
        method: "POST",
        cache: "no-store",
        signal: uploadController.signal,
        headers: { Authorization: `Bearer ${token}` },
        body: uploadForm
      });
      window.clearTimeout(uploadTimeout);
      const uploaded = await readPayload<UploadResult>(uploadResponse);
      if (!uploadResponse.ok || !uploaded.pdfId || !uploaded.storagePath) throw new Error(uploaded.error || "Upload failed.");

      showUploadResult(uploaded);
    } catch (error) {
      const message = error instanceof Error && error.name === "AbortError" ? "Upload or extraction timed out. Try a smaller PDF." : error instanceof Error ? error.message : "Upload failed";
      toast.error(message, { duration: 8000 });
    } finally {
      setBusy(false);
      setStage("idle");
    }
  }

  return (
    <Card className="border-dashed border-aqua/40 bg-white/80">
      <div className="grid gap-3 border-b border-slate-100 pb-5 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          Semester
          <Select className="mt-1" value={semesterId} onChange={(event) => {
            setSemesterId(event.target.value);
            setSubjectName("General");
          }} disabled={busy}>
            {semesters.map((semester) => <option key={semester.semesterId} value={semester.semesterId}>{semester.name}</option>)}
          </Select>
        </label>
        <label className="block text-sm font-semibold">
          Subject
          <Input className="mt-1" list="upload-subject-options" value={subjectName} onChange={(event) => setSubjectName(event.target.value)} maxLength={100} disabled={busy} required />
          <datalist id="upload-subject-options">
            {Array.from(new Set([
              ...medicalSubjectPresets,
              ...subjects.filter((subject) => subject.semesterId === semesterId).map((subject) => subject.name)
            ])).map((name) => <option key={name} value={name} />)}
          </datalist>
        </label>
      </div>
      <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg px-6 py-10 text-center">
        <FileUp className="h-10 w-10 text-aqua" />
        <div>
          <p className="font-semibold">Upload MCQ PDF</p>
          <p className="text-sm text-slate-500">PDF only, up to {maxSizeMb} MB. Questions are extracted automatically.</p>
        </div>
        <input
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          disabled={busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            void handleUpload(file);
          }}
        />
        <span className="inline-flex h-11 items-center justify-center rounded-lg bg-ink px-4 text-sm font-semibold text-white">
          {busy ? (stage === "extracting" ? "Processing PDF..." : "Uploading PDF...") : "Choose PDF"}
        </span>
      </label>
      {busy ? <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-full animate-pulse bg-aqua transition-all" /></div> : null}
    </Card>
  );
}

async function extractQuestionsInBrowser(file: File): Promise<BrowserExtraction> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  const pdfDocument = await pdfjsLib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
    useSystemFonts: true
  }).promise;
  const lines: ExtractedLine[] = [];
  const pages: BrowserRenderedPage[] = [];
  const maxPages = Math.min(pdfDocument.numPages, 80);
  const scale = 1.6;

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const content = await page.getTextContent();
    const textItems = content.items.filter(isBrowserPdfTextItem) as BrowserPdfTextItem[];
    const viewport = page.getViewport({ scale });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) continue;
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    const image = context.getImageData(0, 0, canvas.width, canvas.height).data;
    pages.push({ pageNumber, width: canvas.width, height: canvas.height, canvas, image });
    const groupedLines = groupBrowserTextItems(textItems, viewport, scale);

    for (const group of groupedLines) {
      const text = buildBrowserLineText(group.items);
      if (!text) continue;
      lines.push({
        text,
        pageNumber,
        bounds: browserLineBounds(group, canvas.width, canvas.height),
        styled: detectBrowserStyledAnswer(group)
      });
    }
  }

  const text = sanitizeText(lines.map((line) => line.text).join("\n"));
  const lineQuestions = lines.length ? parseMcqLines(lines) : [];
  const fallbackQuestions = text ? parseMcqText(text) : [];
  const selectedQuestions = extractionScore(lineQuestions) >= extractionScore(fallbackQuestions) ? lineQuestions : fallbackQuestions;
  const questions = attachBrowserDiagrams(selectedQuestions, lines, pages);

  return {
    questions,
    source: pdfDocument.numPages > maxPages ? `browser PDF line extraction, first ${maxPages} pages` : "browser PDF line extraction"
  };
}

function isBrowserPdfTextItem(item: unknown): item is BrowserPdfTextItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    typeof (item as { str?: unknown }).str === "string" &&
    Boolean((item as { str: string }).str.trim()) &&
    Array.isArray((item as { transform?: unknown }).transform)
  );
}

function groupBrowserTextItems(
  items: BrowserPdfTextItem[],
  viewport: { convertToViewportPoint: (x: number, y: number) => number[] },
  scale: number
) {
  const groups: BrowserLineGroup[] = [];

  for (const item of items) {
    const text = item.str.trim();
    if (!text) continue;
    const pdfX = item.transform[4];
    const pdfY = item.transform[5];
    let group = groups.find((candidate) => Math.abs(candidate.y - pdfY) < 3);
    if (!group) {
      group = { y: pdfY, items: [] };
      groups.push(group);
    }

    const [x, baselineY] = viewport.convertToViewportPoint(pdfX, pdfY);
    const height = (item.height || Math.abs(item.transform[3]) || 12) * scale;
    const width = (item.width || Math.max(text.length * (item.height || 10) * 0.45, 8)) * scale;
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

function buildBrowserLineText(items: BrowserLineGroup["items"]) {
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

function browserLineBounds(group: BrowserLineGroup, pageWidth: number, pageHeight: number) {
  return {
    x0: Math.max(0, Math.floor(Math.min(...group.items.map((item) => item.x0)) - 4)),
    y0: Math.max(0, Math.floor(Math.min(...group.items.map((item) => item.yTop)) - 4)),
    x1: Math.min(pageWidth - 1, Math.ceil(Math.max(...group.items.map((item) => item.x1)) + 4)),
    y1: Math.min(pageHeight - 1, Math.ceil(Math.max(...group.items.map((item) => item.yBottom)) + 4)),
    pageWidth,
    pageHeight
  };
}

function detectBrowserStyledAnswer(group: BrowserLineGroup) {
  const text = buildBrowserLineText(group.items);
  if (!/^(?:[\u2713\u2714\u2705\u2611\u221a]\s*|\[\s*x\s*\]\s*|\(\s*x\s*\)\s*)?(?:Hint\s*)?(?:\(?[A-F\u0410\u0430\u0411\u0431\u0412\u0432\u0413\u0433\u0414\u0434\u0415\u0435]\)?|[1-6])[\).:\-]/i.test(text)) return false;
  return group.items.some((item) => Math.abs(item.skew) > 0.5 || /italic|oblique/i.test(item.fontName || ""));
}

function attachBrowserDiagrams(questions: ParsedQuestion[], lines: ExtractedLine[], pages: BrowserRenderedPage[]) {
  if (!pages.length) return questions;
  let remainingDiagramBudget = maxBrowserDiagramPayloadChars;
  return questions.map((question) => {
    const diagrams = extractBrowserQuestionDiagrams(question, lines, pages).filter((diagram) => {
      if (diagram.src.length > remainingDiagramBudget) return false;
      remainingDiagramBudget -= diagram.src.length;
      return true;
    });
    return diagrams.length ? { ...question, diagrams } : question;
  });
}

function extractBrowserQuestionDiagrams(question: ParsedQuestion, lines: ExtractedLine[], pages: BrowserRenderedPage[]) {
  if (!Number.isInteger(question.sourceLineStart) || !Number.isInteger(question.sourceLineEnd)) return [];
  const start = Math.max(0, question.sourceLineStart || 0);
  const end = Math.min(lines.length - 1, question.sourceLineEnd || start);
  const sourceLines = lines.slice(start, end + 1).filter((line) => line.pageNumber && line.bounds);
  const pageNumbers = [...new Set(sourceLines.map((line) => line.pageNumber as number))];
  const diagrams: NonNullable<ParsedQuestion["diagrams"]> = [];

  for (const pageNumber of pageNumbers) {
    const page = pages.find((item) => item.pageNumber === pageNumber);
    if (!page) continue;
    const pageLines = sourceLines.filter((line) => line.pageNumber === pageNumber && line.bounds);
    const diagram = cropBrowserDiagramFromPage(question.questionNumber, page, pageLines);
    if (diagram) diagrams.push(diagram);
    if (diagrams.length >= 2) break;
  }

  return diagrams;
}

function cropBrowserDiagramFromPage(questionNumber: number, page: BrowserRenderedPage, lines: ExtractedLine[]) {
  const bounds = lines.map((line) => line.bounds).filter((item): item is NonNullable<ExtractedLine["bounds"]> => Boolean(item));
  if (!bounds.length) return null;

  const y0 = Math.max(0, Math.floor(Math.min(...bounds.map((item) => item.y0)) - 28));
  const y1 = Math.min(page.height - 1, Math.ceil(Math.max(...bounds.map((item) => item.y1)) + 28));
  const textBoxes = bounds.map((item) => ({
    x0: Math.max(0, item.x0 - 10),
    y0: Math.max(0, item.y0 - 8),
    x1: Math.min(page.width - 1, item.x1 + 10),
    y1: Math.min(page.height - 1, item.y1 + 8)
  }));
  const ink = findBrowserNonTextInkBounds(page, y0, y1, textBoxes);
  if (!ink) return null;

  const cropX = Math.max(0, ink.x0 - 20);
  const cropY = Math.max(0, ink.y0 - 20);
  const cropWidth = Math.min(page.width - cropX, ink.x1 - ink.x0 + 40);
  const cropHeight = Math.min(page.height - cropY, ink.y1 - ink.y0 + 40);
  if (cropWidth < 60 || cropHeight < 45) return null;

  const scale = Math.min(1, 900 / cropWidth);
  const outputWidth = Math.max(1, Math.round(cropWidth * scale));
  const outputHeight = Math.max(1, Math.round(cropHeight * scale));
  const canvas = window.document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "white";
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.drawImage(page.canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
  const src = canvas.toDataURL("image/png");
  if (src.length > 450_000) return null;

  return {
    id: `q${questionNumber}-diagram-p${page.pageNumber}`,
    src,
    alt: `Diagram for question ${questionNumber}`,
    pageNumber: page.pageNumber,
    width: outputWidth,
    height: outputHeight
  };
}

function findBrowserNonTextInkBounds(
  page: BrowserRenderedPage,
  y0: number,
  y1: number,
  textBoxes: Array<{ x0: number; y0: number; x1: number; y1: number }>
) {
  const step = 3;
  let count = 0;
  let x0 = page.width;
  let yMin = page.height;
  let x1 = 0;
  let yMax = 0;

  for (let y = y0; y <= y1; y += step) {
    for (let x = 0; x < page.width; x += step) {
      if (isInsideBrowserTextBox(x, y, textBoxes)) continue;
      const index = (y * page.width + x) * 4;
      if (!isBrowserDiagramInkPixel(page.image[index], page.image[index + 1], page.image[index + 2], page.image[index + 3])) continue;
      count += 1;
      x0 = Math.min(x0, x);
      yMin = Math.min(yMin, y);
      x1 = Math.max(x1, x);
      yMax = Math.max(yMax, y);
    }
  }

  const width = x1 - x0;
  const height = yMax - yMin;
  if (count < 90 || width < 70 || height < 42) return null;
  return { x0, y0: yMin, x1, y1: yMax };
}

function isInsideBrowserTextBox(x: number, y: number, boxes: Array<{ x0: number; y0: number; x1: number; y1: number }>) {
  return boxes.some((box) => x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1);
}

function isBrowserDiagramInkPixel(red: number, green: number, blue: number, alpha: number) {
  if (alpha < 25) return false;
  const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  return luminance < 205 && (luminance < 165 || chroma > 35);
}

function usableQuestionCount(questions: ParsedQuestion[]) {
  return questions.filter((question) => {
    const optionCount = Object.values(question.options || {}).filter((value) => value?.trim()).length;
    return question.questionText?.trim() && optionCount >= 2;
  }).length;
}

function extractionScore(questions: ParsedQuestion[]) {
  const readyCount = questions.filter((question) => question.status === "ready").length;
  return usableQuestionCount(questions) * 4 + readyCount * 2;
}

async function requestCloudinarySignature(file: File, token: string) {
  const response = await fetch("/api/cloudinary/sign-pdf-upload", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ fileName: file.name, fileSize: file.size, contentType: file.type })
  });
  const payload = await readPayload<CloudinarySignature>(response);
  if (response.ok) return payload;

  if (file.size > vercelSafeFallbackMb * 1024 * 1024) {
    throw new Error(payload.error || "Large PDFs must be uploaded directly to Cloudinary. Check Cloudinary environment variables in Vercel.");
  }

  return null;
}

async function uploadDirectlyToCloudinary(file: File, signature: CloudinarySignature) {
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", signature.apiKey);
  form.append("timestamp", String(signature.timestamp));
  form.append("public_id", signature.publicId);
  form.append("overwrite", "true");
  form.append("signature", signature.signature);

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 300000);
  const response = await fetch(signature.uploadUrl, {
    method: "POST",
    signal: controller.signal,
    body: form
  });
  window.clearTimeout(timeout);

  const payload = (await response.json().catch(() => ({}))) as CloudinaryUpload;
  if (!response.ok || !payload.secure_url) {
    throw new Error(`Cloudinary upload failed: ${payload.error?.message || response.statusText}`);
  }

  return payload;
}

async function completeCloudinaryUpload(
  file: File,
  token: string,
  signature: CloudinarySignature,
  fileUrl: string,
  extraction: BrowserExtraction,
  organization: { semesterId: string; semesterName: string; subjectId: string; subjectName: string }
) {
  const response = await fetch("/api/cloudinary/complete-pdf-upload", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      pdfId: signature.pdfId,
      fileName: file.name,
      fileUrl,
      storagePath: signature.storagePath,
      bucketName: signature.bucketName,
      extractedQuestions: extraction.questions,
      extractionSource: extraction.source,
      ...organization
    })
  });
  const payload = await readPayload<UploadResult>(response);
  if (!response.ok || !payload.pdfId || !payload.storagePath) throw new Error(payload.error || "PDF uploaded, but extraction could not start.");
  return payload;
}

function showUploadResult(uploaded: UploadResult) {
  if (uploaded.extractionError) {
    toast.error(`PDF uploaded, but extraction failed: ${uploaded.extractionError}`, { duration: 10000 });
  } else if (uploaded.needsReview) {
    toast.success(`${uploaded.localFallback ? "PDF saved locally. " : "PDF uploaded. "}${uploaded.readyQuestions || 0} ready, ${uploaded.needsReview} need review.`);
  } else {
    toast.success(`${uploaded.localFallback ? "PDF saved locally. " : "PDF uploaded. "}${uploaded.totalQuestions || 0} questions are ready.`);
  }
}
