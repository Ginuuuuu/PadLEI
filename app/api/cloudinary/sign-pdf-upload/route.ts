import { NextResponse } from "next/server";
import { createCloudinaryPdfUploadSignature } from "@/lib/server-pdf-storage";
import { requireApprovedUser, safeApiError } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxSizeMb = 20;

export async function POST(request: Request) {
  try {
    const { ownerId } = await requireApprovedUser(request);

    const body = (await request.json()) as { fileName?: string; fileSize?: number; contentType?: string };
    const fileName = body.fileName?.trim() || "";
    const fileSize = Number(body.fileSize || 0);
    const isPdf = body.contentType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
    if (!fileName || !isPdf) return NextResponse.json({ error: "Only PDF files are allowed." }, { status: 400 });
    if (fileSize > maxSizeMb * 1024 * 1024) return NextResponse.json({ error: `PDF must be under ${maxSizeMb} MB.` }, { status: 400 });

    const pdfId = crypto.randomUUID();
    const upload = createCloudinaryPdfUploadSignature({ userId: ownerId, pdfId, fileName });
    if (!upload) {
      return NextResponse.json(
        { error: "Cloudinary direct upload is not configured. Add Cloudinary environment variables in Vercel." },
        { status: 501 }
      );
    }

    return NextResponse.json({ pdfId, ...upload });
  } catch (error) {
    const safe = safeApiError(error, "Could not prepare upload.");
    return NextResponse.json({ error: safe.message }, { status: safe.status });
  }
}
