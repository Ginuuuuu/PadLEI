import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { createCloudinaryPdfUploadSignature } from "@/lib/server-pdf-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxSizeMb = 20;

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Login required." }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userDoc.exists || userDoc.data()?.approved !== true) {
      return NextResponse.json({ error: "Approved user access required." }, { status: 403 });
    }

    const body = (await request.json()) as { fileName?: string; fileSize?: number; contentType?: string };
    const fileName = body.fileName?.trim() || "";
    const fileSize = Number(body.fileSize || 0);
    const isPdf = body.contentType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
    if (!fileName || !isPdf) return NextResponse.json({ error: "Only PDF files are allowed." }, { status: 400 });
    if (fileSize > maxSizeMb * 1024 * 1024) return NextResponse.json({ error: `PDF must be under ${maxSizeMb} MB.` }, { status: 400 });

    const pdfId = crypto.randomUUID();
    const upload = createCloudinaryPdfUploadSignature({ userId: decoded.uid, pdfId, fileName });
    if (!upload) {
      return NextResponse.json(
        { error: "Cloudinary direct upload is not configured. Add Cloudinary environment variables in Vercel." },
        { status: 501 }
      );
    }

    return NextResponse.json({ pdfId, ...upload });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not prepare upload." }, { status: 500 });
  }
}
