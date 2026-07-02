import { NextResponse } from "next/server";
import histologySeed from "@/lib/default-pdfs/histology-osh-2025-2026.json";
import { adminDb } from "@/lib/firebase-admin";
import { formatExtractionError, processClientExtractedQuestions, processStoredPdf } from "@/lib/server-pdf-extraction";
import { histologyQuestionBankKey, knownQuestionBankForHash } from "@/lib/known-question-bank-fingerprints";
import { requireApprovedUser, safeApiError } from "@/lib/server-auth";
import type { ParsedQuestion } from "@/lib/extraction";
import type { PdfFile } from "@/types/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const { ownerId } = await requireApprovedUser(request);

    const body = (await request.json()) as {
      pdfId?: string;
      fileName?: string;
      fileUrl?: string;
      storagePath?: string;
      bucketName?: string;
      extractedQuestions?: ParsedQuestion[];
      extractionSource?: string;
      extractionComplete?: boolean;
      fileSha256?: string;
      knownQuestionBank?: string;
      semesterId?: string;
      semesterName?: string;
      subjectId?: string;
      subjectName?: string;
    };
    const pdfId = body.pdfId?.trim() || "";
    const fileName = body.fileName?.trim() || "";
    const fileUrl = body.fileUrl?.trim() || "";
    const storagePath = body.storagePath?.trim() || "";
    const bucketName = body.bucketName?.trim() || "";

    if (!pdfId || !fileName || !fileUrl || !storagePath || !bucketName) {
      return NextResponse.json({ error: "Upload metadata is incomplete." }, { status: 400 });
    }
    if (!storagePath.startsWith(`cloudinary/raw/study-pdfs/${ownerId}/${pdfId}-`)) {
      return NextResponse.json({ error: "Upload metadata does not match this user." }, { status: 403 });
    }
    if (!fileUrl.startsWith(`https://res.cloudinary.com/${bucketName}/`)) {
      return NextResponse.json({ error: "Cloudinary upload URL is invalid." }, { status: 400 });
    }

    const uploadedAt = new Date().toISOString();
    const pdf: PdfFile = {
      pdfId,
      userId: ownerId,
      fileName,
      fileUrl,
      storagePath,
      bucketName,
      storageProvider: "cloudinary",
      uploadedAt,
      status: "uploaded",
      totalQuestions: 0,
      readyQuestions: 0,
      needsReviewQuestions: 0,
      errorMessage: "",
      semesterId: body.semesterId?.trim() || "uncategorized",
      semesterName: body.semesterName?.trim().slice(0, 100) || "Uncategorized",
      subjectId: body.subjectId?.trim() || "general",
      subjectName: body.subjectName?.trim().slice(0, 100) || "General"
    };

    await adminDb.collection("pdfs").doc(pdfId).set(pdf);
    let extraction = { totalQuestions: 0, readyQuestions: 0, needsReview: 0 };
    let extractionError = "";

    try {
      const verifiedKnownQuestionBank = body.knownQuestionBank === histologyQuestionBankKey
        && knownQuestionBankForHash(body.fileSha256 || "") === histologyQuestionBankKey;
      const usableClientQuestions = Array.isArray(body.extractedQuestions)
        && body.extractedQuestions.some((question) => (
          Boolean(question?.questionText?.trim())
          && Object.values(question?.options || {}).filter((option) => option?.trim()).length >= 2
        ));

      if (verifiedKnownQuestionBank) {
        extraction = await processClientExtractedQuestions({
          pdfId,
          userId: ownerId,
          questions: histologySeed.questions as ParsedQuestion[],
          source: "verified Histology question bank"
        });
      } else if (body.extractionComplete && usableClientQuestions) {
        extraction = await processClientExtractedQuestions({
          pdfId,
          userId: ownerId,
          questions: body.extractedQuestions || [],
          source: body.extractionSource || "browser PDF text extraction"
        });
      } else {
        extraction = await processStoredPdf({ pdfId, userId: ownerId, storagePath, bucketName, fileUrl });
      }
    } catch (error) {
      extractionError = formatExtractionError(error);
    }

    return NextResponse.json({
      pdfId,
      storagePath,
      bucketName,
      storageProvider: "cloudinary",
      fileName,
      totalQuestions: extraction.totalQuestions,
      readyQuestions: extraction.readyQuestions,
      needsReview: extraction.needsReview,
      extractionError
    });
  } catch (error) {
    const safe = safeApiError(error, "Could not complete upload.");
    return NextResponse.json({ error: safe.message }, { status: safe.status });
  }
}
