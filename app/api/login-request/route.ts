import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import type { LoginRequest } from "@/types/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      fullName?: string;
      gmail?: string;
      preferredPassword?: string;
      confirmPassword?: string;
    };
    const fullName = body.fullName?.trim() || "";
    const gmail = body.gmail?.toLowerCase().trim() || "";
    const preferredPassword = body.preferredPassword?.trim() || "";
    const confirmPassword = body.confirmPassword?.trim() || "";

    if (!fullName || !gmail || !preferredPassword || !confirmPassword) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gmail)) {
      return NextResponse.json({ error: "Enter a valid Gmail address." }, { status: 400 });
    }
    if (preferredPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }
    if (preferredPassword !== confirmPassword) {
      return NextResponse.json({ error: "Passwords must match." }, { status: 400 });
    }

    const requestId = crypto.randomUUID();
    const now = new Date().toISOString();
    const payload: LoginRequest = {
      requestId,
      fullName,
      gmail,
      preferredPassword,
      requestedRole: "user",
      status: "pending",
      createdAt: now,
      updatedAt: now
    };

    await adminDb.collection("loginRequests").doc(requestId).set(payload);
    return NextResponse.json({ requestId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not submit request." }, { status: 500 });
  }
}
