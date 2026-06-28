import { NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/account";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireApprovedUser, safeApiError } from "@/lib/server-auth";
import type { UserRole } from "@/types/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireApprovedUser(request, { admin: true });
    const body = (await request.json()) as Record<string, unknown>;
    if (Object.keys(body).some((key) => !["email", "role", "name"].includes(key))) {
      return NextResponse.json({ error: "Unexpected fields were submitted." }, { status: 400 });
    }

    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
    const role: UserRole = body.role === "admin" ? "admin" : "user";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    }

    let authUser;
    let createdAuthUser = false;
    try {
      authUser = await adminAuth.getUserByEmail(email);
      if (authUser.disabled) authUser = await adminAuth.updateUser(authUser.uid, { disabled: false });
    } catch {
      authUser = await adminAuth.createUser({ email, displayName: name, emailVerified: false, disabled: false });
      createdAuthUser = true;
    }

    const existingUsers = await adminDb.collection("users").where("email", "==", email).limit(1).get();
    const existing = existingUsers.docs[0]?.data() as { ownerId?: string; createdAt?: string } | undefined;
    const ownerId = existing?.ownerId || existingUsers.docs[0]?.id || authUser.uid;
    const now = new Date().toISOString();
    const createdAt = existing?.createdAt || now;
    await Promise.all([
      adminDb.collection("users").doc(authUser.uid).set(
        {
          uid: authUser.uid,
          ownerId,
          email,
          normalizedEmail: email,
          name: name || authUser.displayName || "",
          role,
          approved: true,
          mustChangePassword: false,
          createdAt,
          updatedAt: now
        },
        { merge: true }
      ),
      adminDb.collection("approvals").doc(email).set(
        { email, normalizedEmail: email, ownerId, role, approved: true, createdAt, updatedAt: now },
        { merge: true }
      )
    ]);

    const resetLink = await adminAuth.generatePasswordResetLink(email);
    return NextResponse.json({ uid: authUser.uid, email, role, resetLink, createdAuthUser });
  } catch (error) {
    const safe = safeApiError(error, "Could not create user.");
    return NextResponse.json({ error: safe.message }, { status: safe.status });
  }
}
