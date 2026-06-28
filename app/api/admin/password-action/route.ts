import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/account";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireApprovedUser, safeApiError } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireApprovedUser(request, { admin: true });
    const body = (await request.json()) as Record<string, unknown>;
    if (Object.keys(body).some((key) => !["email", "action"].includes(key))) {
      return NextResponse.json({ error: "Unexpected fields were submitted." }, { status: 400 });
    }

    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    const action = body.action === "temporaryPassword" ? "temporaryPassword" : "resetLink";
    if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });

    const authUser = await adminAuth.getUserByEmail(email);
    if (action === "resetLink") {
      const resetLink = await adminAuth.generatePasswordResetLink(email);
      return NextResponse.json({ email, resetLink });
    }

    const temporaryPassword = generateTemporaryPassword();
    await adminAuth.updateUser(authUser.uid, { password: temporaryPassword, disabled: false });
    await adminAuth.revokeRefreshTokens(authUser.uid);
    await adminDb.collection("users").doc(authUser.uid).set(
      { mustChangePassword: true, updatedAt: new Date().toISOString() },
      { merge: true }
    );
    return NextResponse.json({ email, temporaryPassword });
  } catch (error) {
    const safe = safeApiError(error, "Could not prepare a password reset.");
    return NextResponse.json({ error: safe.message }, { status: safe.status });
  }
}

function generateTemporaryPassword() {
  return `P!${randomBytes(12).toString("base64url")}7a`;
}
