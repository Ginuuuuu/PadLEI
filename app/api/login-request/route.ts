import { NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/account";
import { adminDb } from "@/lib/firebase-admin";
import type { LoginRequest } from "@/types/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 20_000) {
      return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const allowedKeys = new Set(["fullName", "email", "contactMethod"]);
    if (Object.keys(body).some((key) => !allowedKeys.has(key) || /password|secret|token/i.test(key))) {
      return NextResponse.json({ error: "Unexpected fields were submitted." }, { status: 400 });
    }

    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    const contactMethod = body.contactMethod === "email" ? "email" : body.contactMethod === "whatsapp" ? "whatsapp" : "";

    if (!fullName || !email || !contactMethod) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }
    if (fullName.length > 100) {
      return NextResponse.json({ error: "Full name must be 100 characters or fewer." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const requestId = crypto.randomUUID();
    const now = new Date().toISOString();
    const payload: LoginRequest = {
      requestId,
      fullName,
      email,
      contactMethod,
      requestedRole: "user",
      status: "pending",
      createdAt: now,
      updatedAt: now
    };

    await adminDb.collection("loginRequests").doc(requestId).set(payload);
    return NextResponse.json({ requestId, fullName, email, contactMethod });
  } catch {
    return NextResponse.json({ error: "Could not submit request." }, { status: 500 });
  }
}
