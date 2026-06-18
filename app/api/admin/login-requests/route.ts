import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import type { UserRole } from "@/types/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action = "approve" | "reject" | "delete";

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Admin login required." }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const adminUser = await adminDb.collection("users").doc(decoded.uid).get();
    if (!adminUser.exists || adminUser.data()?.role !== "admin" || adminUser.data()?.approved !== true) {
      return NextResponse.json({ error: "Only admin users can manage login requests." }, { status: 403 });
    }

    const body = (await request.json()) as {
      requestId?: string;
      action?: Action;
      role?: UserRole;
      password?: string;
    };
    const requestId = body.requestId?.trim();
    const action = body.action;
    if (!requestId || !action) return NextResponse.json({ error: "Request id and action are required." }, { status: 400 });

    const requestRef = adminDb.collection("loginRequests").doc(requestId);
    const requestDoc = await requestRef.get();
    if (!requestDoc.exists) return NextResponse.json({ error: "Login request not found." }, { status: 404 });

    const requestData = requestDoc.data() as { fullName?: string; gmail?: string; preferredPassword?: string };
    const email = requestData.gmail?.toLowerCase().trim();
    if (!email) return NextResponse.json({ error: "Login request email is missing." }, { status: 400 });

    if (action === "delete") {
      await requestRef.delete();
      return NextResponse.json({ ok: true });
    }

    const updatedAt = new Date().toISOString();
    if (action === "reject") {
      await requestRef.set({ status: "rejected", updatedAt }, { merge: true });
      return NextResponse.json({ ok: true });
    }

    const role = body.role === "admin" ? "admin" : "user";
    const password = body.password?.trim() || requestData.preferredPassword?.trim() || "";
    if (password.length < 6) return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });

    let uid: string;
    let createdAuthUser = false;
    try {
      const existing = await adminAuth.getUserByEmail(email);
      uid = existing.uid;
      await adminAuth.updateUser(uid, { password, disabled: false });
    } catch {
      const created = await adminAuth.createUser({
        email,
        password,
        displayName: requestData.fullName || "",
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
      name: requestData.fullName || "",
      role,
      approved: true,
      createdAt,
      updatedAt
    };

    await Promise.all([
      adminDb.collection("users").doc(uid).set(userRecord, { merge: true }),
      adminDb.collection("approvals").doc(email).set({ email, role, approved: true, createdAt, updatedAt }, { merge: true }),
      requestRef.set({ status: "approved", updatedAt }, { merge: true })
    ]);

    return NextResponse.json({ ok: true, uid, email, role, createdAuthUser });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not manage login request." }, { status: 500 });
  }
}
