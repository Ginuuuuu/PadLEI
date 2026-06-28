import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/account";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireApprovedUser, safeApiError } from "@/lib/server-auth";
import type { UserRole } from "@/types/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action = "approve" | "reject" | "delete";

export async function POST(request: Request) {
  try {
    await requireApprovedUser(request, { admin: true });
    const body = (await request.json()) as Record<string, unknown>;
    const allowed = new Set(["requestId", "action", "role"]);
    if (Object.keys(body).some((key) => !allowed.has(key))) {
      return NextResponse.json({ error: "Unexpected fields were submitted." }, { status: 400 });
    }

    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    const action = body.action as Action;
    if (!requestId || !["approve", "reject", "delete"].includes(action)) {
      return NextResponse.json({ error: "A valid request id and action are required." }, { status: 400 });
    }

    const requestRef = adminDb.collection("loginRequests").doc(requestId);
    const requestDoc = await requestRef.get();
    if (!requestDoc.exists) return NextResponse.json({ error: "Login request not found." }, { status: 404 });

    if (action === "delete") {
      await requestRef.delete();
      return NextResponse.json({ ok: true });
    }

    const requestData = requestDoc.data() as { fullName?: string; email?: string; gmail?: string; createdAt?: string };
    const email = normalizeEmail(requestData.email || requestData.gmail || "");
    if (!email) return NextResponse.json({ error: "Login request email is missing." }, { status: 400 });

    const updatedAt = new Date().toISOString();
    if (action === "reject") {
      await requestRef.set(
        { status: "rejected", updatedAt, preferredPassword: FieldValue.delete() },
        { merge: true }
      );
      return NextResponse.json({ ok: true });
    }

    const role: UserRole = body.role === "admin" ? "admin" : "user";
    let authUser;
    let createdAuthUser = false;
    try {
      authUser = await adminAuth.getUserByEmail(email);
      if (authUser.disabled) authUser = await adminAuth.updateUser(authUser.uid, { disabled: false });
    } catch {
      authUser = await adminAuth.createUser({
        email,
        displayName: requestData.fullName || "",
        emailVerified: false,
        disabled: false
      });
      createdAuthUser = true;
    }

    const existingUsers = await adminDb.collection("users").where("email", "==", email).limit(1).get();
    const existingData = existingUsers.docs[0]?.data() as { ownerId?: string; createdAt?: string } | undefined;
    const ownerId = existingData?.ownerId || existingUsers.docs[0]?.id || authUser.uid;
    const createdAt = existingData?.createdAt || requestData.createdAt || updatedAt;
    const userRecord = {
      uid: authUser.uid,
      ownerId,
      email,
      normalizedEmail: email,
      name: requestData.fullName || authUser.displayName || "",
      role,
      approved: true,
      mustChangePassword: false,
      createdAt,
      updatedAt
    };
    const resetLink = await adminAuth.generatePasswordResetLink(email);

    await Promise.all([
      adminDb.collection("users").doc(authUser.uid).set(userRecord, { merge: true }),
      adminDb.collection("approvals").doc(email).set(
        { email, normalizedEmail: email, ownerId, role, approved: true, createdAt, updatedAt },
        { merge: true }
      ),
      requestRef.set(
        {
          email,
          contactMethod: requestDoc.data()?.contactMethod || "email",
          status: "approved",
          updatedAt,
          gmail: FieldValue.delete(),
          preferredPassword: FieldValue.delete()
        },
        { merge: true }
      )
    ]);

    return NextResponse.json({ ok: true, uid: authUser.uid, email, role, createdAuthUser, resetLink });
  } catch (error) {
    const safe = safeApiError(error, "Could not manage login request.");
    return NextResponse.json({ error: safe.message }, { status: safe.status });
  }
}
