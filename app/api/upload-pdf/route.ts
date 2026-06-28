import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireApprovedUser, safeApiError } from "@/lib/server-auth";
import { formatExtractionError, processPdfBuffer } from "@/lib/server-pdf-extraction";
import { savePdfBuffer } from "@/lib/server-pdf-storage";
import type { PdfFile } from "@/types/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const maxSizeMb = 20;

export async function POST(request: Request) {
  try {
    const { ownerId } = await requireApprovedUser(request);

    const form = await request.formData();
    const file = form.get("file");
    const semesterId = String(form.get("semesterId") || "uncategorized");
    const semesterName = String(form.get("semesterName") || "Uncategorized").slice(0, 100);
    const subjectId = String(form.get("subjectId") || "general");
    const subjectName = String(form.get("subjectName") || "General").slice(0, 100);
    if (!(file instanceof File)) return NextResponse.json({ error: "PDF file is required." }, { status: 400 });
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) return NextResponse.json({ error: "Only PDF files are allowed." }, { status: 400 });
    if (file.size > maxSizeMb * 1024 * 1024) return NextResponse.json({ error: `PDF must be under ${maxSizeMb} MB.` }, { status: 400 });

    const pdfId = crypto.randomUUID();
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await savePdfBuffer({ userId: ownerId, pdfId, fileName: file.name, buffer });

    const pdf: PdfFile = {
      pdfId,
      userId: ownerId,
      fileName: file.name,
      fileUrl: stored.fileUrl,
      storagePath: stored.storagePath,
      bucketName: stored.bucketName,
      storageProvider: stored.provider,
      uploadedAt: new Date().toISOString(),
      status: "uploaded",
      totalQuestions: 0,
      readyQuestions: 0,
      needsReviewQuestions: 0,
      errorMessage: stored.localFallback ? "Cloudinary is not configured yet. PDF saved locally, so text PDFs will work on this computer." : "",
      semesterId,
      semesterName,
      subjectId,
      subjectName
    };

    await adminDb.collection("pdfs").doc(pdfId).set(pdf);
    let extraction = { totalQuestions: 0, readyQuestions: 0, needsReview: 0 };
    let extractionError = "";

    try {
      extraction = await processPdfBuffer({
        pdfId,
        userId: ownerId,
        storagePath: stored.storagePath,
        bucketName: stored.bucketName,
        buffer
      });
    } catch (error) {
      extractionError = formatExtractionError(error);
    }

    return NextResponse.json({
      pdfId,
      storagePath: stored.storagePath,
      bucketName: stored.bucketName,
      storageProvider: stored.provider,
      fileName: file.name,
      localFallback: stored.localFallback,
      totalQuestions: extraction.totalQuestions,
      readyQuestions: extraction.readyQuestions,
      needsReview: extraction.needsReview,
      extractionError
    });
  } catch (error) {
    const safe = safeApiError(error, "Upload failed.");
    return NextResponse.json({ error: safe.message }, { status: safe.status });
  }
}
