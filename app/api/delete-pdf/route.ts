import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { deletePdfFile } from "@/lib/server-pdf-storage";
import { requireApprovedUser, safeApiError } from "@/lib/server-auth";
import type { PdfFile } from "@/types/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const { appUser, ownerId } = await requireApprovedUser(request);
    const body = (await request.json()) as { pdfId?: string };
    const pdfId = String(body.pdfId || "");
    if (!pdfId) return NextResponse.json({ error: "PDF id is required." }, { status: 400 });

    const pdfRef = adminDb.collection("pdfs").doc(pdfId);
    const pdfDoc = await pdfRef.get();
    if (!pdfDoc.exists) return NextResponse.json({ ok: true });

    const pdf = pdfDoc.data() as PdfFile;
    if (appUser.role !== "admin" && pdf.userId !== ownerId) {
      return NextResponse.json({ error: "You cannot delete this PDF." }, { status: 403 });
    }

    await deletePdfFile(pdf.storagePath, pdf.bucketName);

    const questionDocs = await adminDb.collection("questions").where("pdfId", "==", pdfId).get();
    const writer = adminDb.bulkWriter();
    questionDocs.docs.forEach((question) => writer.delete(question.ref));
    writer.delete(pdfRef);
    await writer.close();

    return NextResponse.json({ ok: true });
  } catch (error) {
    const safe = safeApiError(error, "Delete failed.");
    return NextResponse.json({ error: safe.message }, { status: safe.status });
  }
}
