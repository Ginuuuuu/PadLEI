import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { bucketNameFromFileUrl } from "@/lib/server-pdf-storage";
import { processStoredPdf } from "@/lib/server-pdf-extraction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { pdfId?: string; userId?: string; storagePath?: string; bucketName?: string };
    const pdfId = String(body.pdfId || "");
    const requestedUserId = String(body.userId || "");
    const requestedStoragePath = String(body.storagePath || "");
    const token = request.headers.get("authorization")?.replace("Bearer ", "");

    if (!pdfId) {
      return NextResponse.json({ error: "Missing PDF id." }, { status: 400 });
    }
    if (!token) {
      return NextResponse.json({ error: "Login required." }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(token);
    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userDoc.exists || userDoc.data()?.approved !== true) {
      return NextResponse.json({ error: "Approved user access required." }, { status: 403 });
    }
    const isAdmin = userDoc.data()?.role === "admin";

    const pdfDoc = await adminDb.collection("pdfs").doc(pdfId).get();
    if (!pdfDoc.exists) return NextResponse.json({ error: "PDF not found." }, { status: 404 });
    const pdfData = pdfDoc.data();
    const userId = String(pdfData?.userId || requestedUserId || "");
    const storagePath = String(pdfData?.storagePath || requestedStoragePath || "");
    if (!userId || !storagePath) return NextResponse.json({ error: "PDF metadata is incomplete." }, { status: 400 });
    if (!isAdmin && pdfData?.userId !== decoded.uid) {
      return NextResponse.json({ error: "Invalid upload owner." }, { status: 403 });
    }
    if (requestedUserId && requestedUserId !== userId) {
      return NextResponse.json({ error: "PDF metadata does not match this user." }, { status: 403 });
    }
    if (requestedStoragePath && requestedStoragePath !== storagePath) {
      return NextResponse.json({ error: "PDF metadata does not match this user." }, { status: 403 });
    }

    const bucketName = String(body.bucketName || pdfData?.bucketName || bucketNameFromFileUrl(pdfData?.fileUrl) || "");
    const result = await processStoredPdf({ pdfId, userId, storagePath, bucketName, fileUrl: String(pdfData?.fileUrl || "") });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Extraction failed." }, { status: 500 });
  }
}
