import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireApprovedUser, safeApiError } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { decoded } = await requireApprovedUser(request);
    await adminDb.collection("users").doc(decoded.uid).set(
      { mustChangePassword: false, updatedAt: new Date().toISOString() },
      { merge: true }
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const safe = safeApiError(error, "Could not update password status.");
    return NextResponse.json({ error: safe.message }, { status: safe.status });
  }
}
