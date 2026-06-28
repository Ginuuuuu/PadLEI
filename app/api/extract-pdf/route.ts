import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { bucketNameFromFileUrl } from "@/lib/server-pdf-storage";
import { processStoredPdf } from "@/lib/server-pdf-extraction";
import { requireApprovedUser, safeApiError } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { pdfId?: string; storagePath?: string; bucketName?: string };
    const pdfId = String(body.pdfId || "");
    const requestedStoragePath = String(body.storagePath || "");

    if (!pdfId) {
      return NextResponse.json({ error: "Missing PDF id." }, { status: 400 });
    }
    const { appUser, ownerId } = await requireApprovedUser(request);

    const pdfDoc = await adminDb.collection("pdfs").doc(pdfId).get();
    if (!pdfDoc.exists) return NextResponse.json({ error: "PDF not found." }, { status: 404 });
    const pdfData = pdfDoc.data();
    const userId = String(pdfData?.userId || "");
    const storagePath = String(pdfData?.storagePath || requestedStoragePath || "");
    if (!userId || !storagePath) return NextResponse.json({ error: "PDF metadata is incomplete." }, { status: 400 });
    if (appUser.role !== "admin" && pdfData?.userId !== ownerId) {
      return NextResponse.json({ error: "Invalid upload owner." }, { status: 403 });
    }
    if (requestedStoragePath && requestedStoragePath !== storagePath) {
      return NextResponse.json({ error: "PDF metadata does not match this user." }, { status: 403 });
    }

    const bucketName = String(body.bucketName || pdfData?.bucketName || bucketNameFromFileUrl(pdfData?.fileUrl) || "");
    const result = await processStoredPdf({ pdfId, userId, storagePath, bucketName, fileUrl: String(pdfData?.fileUrl || "") });
    return NextResponse.json(result);
  } catch (error) {
    const safe = safeApiError(error, "Extraction failed.");
    return NextResponse.json({ error: safe.message }, { status: safe.status });
  }
}
