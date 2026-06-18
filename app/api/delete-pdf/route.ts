import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { deletePdfFile } from "@/lib/server-pdf-storage";
import type { PdfFile } from "@/types/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Login required." }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const body = (await request.json()) as { pdfId?: string };
    const pdfId = String(body.pdfId || "");
    if (!pdfId) return NextResponse.json({ error: "PDF id is required." }, { status: 400 });

    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
    const user = userDoc.data();
    if (!userDoc.exists || user?.approved !== true) {
      return NextResponse.json({ error: "Approved user access required." }, { status: 403 });
    }

    const pdfRef = adminDb.collection("pdfs").doc(pdfId);
    const pdfDoc = await pdfRef.get();
    if (!pdfDoc.exists) return NextResponse.json({ ok: true });

    const pdf = pdfDoc.data() as PdfFile;
    const isAdmin = user.role === "admin";
    if (!isAdmin && pdf.userId !== decoded.uid) {
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Delete failed." }, { status: 500 });
  }
}
