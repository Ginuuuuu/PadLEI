import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { formatExtractionError, processClientExtractedQuestions, processStoredPdf } from "@/lib/server-pdf-extraction";
import type { ParsedQuestion } from "@/lib/extraction";
import type { PdfFile } from "@/types/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Login required." }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userDoc.exists || userDoc.data()?.approved !== true) {
      return NextResponse.json({ error: "Approved user access required." }, { status: 403 });
    }

    const body = (await request.json()) as {
      pdfId?: string;
      fileName?: string;
      fileUrl?: string;
      storagePath?: string;
      bucketName?: string;
      extractedQuestions?: ParsedQuestion[];
      extractionSource?: string;
    };
    const pdfId = body.pdfId?.trim() || "";
    const fileName = body.fileName?.trim() || "";
    const fileUrl = body.fileUrl?.trim() || "";
    const storagePath = body.storagePath?.trim() || "";
    const bucketName = body.bucketName?.trim() || "";

    if (!pdfId || !fileName || !fileUrl || !storagePath || !bucketName) {
      return NextResponse.json({ error: "Upload metadata is incomplete." }, { status: 400 });
    }
    if (!storagePath.startsWith(`cloudinary/raw/study-pdfs/${decoded.uid}/${pdfId}-`)) {
      return NextResponse.json({ error: "Upload metadata does not match this user." }, { status: 403 });
    }
    if (!fileUrl.startsWith(`https://res.cloudinary.com/${bucketName}/`)) {
      return NextResponse.json({ error: "Cloudinary upload URL is invalid." }, { status: 400 });
    }

    const uploadedAt = new Date().toISOString();
    const pdf: PdfFile = {
      pdfId,
      userId: decoded.uid,
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
      errorMessage: ""
    };

    await adminDb.collection("pdfs").doc(pdfId).set(pdf);
    let extraction = { totalQuestions: 0, readyQuestions: 0, needsReview: 0 };
    let extractionError = "";

    try {
      if (Array.isArray(body.extractedQuestions)) {
        extraction = await processClientExtractedQuestions({
          pdfId,
          userId: decoded.uid,
          questions: body.extractedQuestions,
          source: body.extractionSource || "browser PDF text extraction"
        });
      } else {
        extraction = await processStoredPdf({ pdfId, userId: decoded.uid, storagePath, bucketName, fileUrl });
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not complete upload." }, { status: 500 });
  }
}
