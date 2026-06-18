import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import type { UserRole } from "@/types/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Admin login required." }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const adminUser = await adminDb.collection("users").doc(decoded.uid).get();
    if (!adminUser.exists || adminUser.data()?.role !== "admin" || adminUser.data()?.approved !== true) {
      return NextResponse.json({ error: "Only admin users can create accounts." }, { status: 403 });
    }

    const body = (await request.json()) as { email?: string; role?: UserRole; password?: string };
    const email = body.email?.toLowerCase().trim();
    const role = body.role === "admin" ? "admin" : "user";
    const password = body.password?.trim() || generatePassword();

    if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });

    let uid: string;
    let createdAuthUser = false;

    try {
      const existing = await adminAuth.getUserByEmail(email);
      uid = existing.uid;
      await adminAuth.updateUser(uid, { password, disabled: false, emailVerified: existing.emailVerified });
    } catch {
      const created = await adminAuth.createUser({
        email,
        password,
        emailVerified: false,
        disabled: false
      });
      uid = created.uid;
      createdAuthUser = true;
    }

    const createdAt = new Date().toISOString();
    const userRecord = {
      uid,
      email,
      name: "",
      role,
      approved: true,
      createdAt
    };

    await Promise.all([
      adminDb.collection("users").doc(uid).set(userRecord, { merge: true }),
      adminDb.collection("approvals").doc(email).set({ email, role, approved: true, createdAt }, { merge: true }),
      adminDb.collection("users").doc(`pending_${email.replace(/[^a-z0-9]/gi, "_")}`).delete().catch(() => undefined)
    ]);

    return NextResponse.json({
      uid,
      email,
      role,
      temporaryPassword: password,
      createdAuthUser
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create user. Check Firebase Admin environment variables."
      },
      { status: 500 }
    );
  }
}

function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const values = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}
