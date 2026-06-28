import { NextResponse } from "next/server";
import { requireApprovedUser, safeApiError } from "@/lib/server-auth";
import { createProfileUploadSignature } from "@/lib/server-profile-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedExtensions = /\.(jpe?g|png|webp)$/i;

export async function POST(request: Request) {
  try {
    const { ownerId } = await requireApprovedUser(request);
    const body = (await request.json()) as Record<string, unknown>;
    if (Object.keys(body).some((key) => !["fileName", "fileSize", "contentType"].includes(key))) {
      return NextResponse.json({ error: "Unexpected fields were submitted." }, { status: 400 });
    }
    const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
    const fileSize = Number(body.fileSize || 0);
    const contentType = typeof body.contentType === "string" ? body.contentType : "";
    if (!allowedTypes.has(contentType) || !allowedExtensions.test(fileName)) {
      return NextResponse.json({ error: "Profile photo must be JPG, JPEG, PNG, or WebP." }, { status: 400 });
    }
    if (!fileSize || fileSize > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Profile photo must be 2 MB or smaller." }, { status: 400 });
    }
    const upload = createProfileUploadSignature(ownerId);
    if (!upload) return NextResponse.json({ error: "Cloudinary profile uploads are not configured." }, { status: 501 });
    return NextResponse.json(upload);
  } catch (error) {
    const safe = safeApiError(error, "Could not prepare profile upload.");
    return NextResponse.json({ error: safe.message }, { status: safe.status });
  }
}
