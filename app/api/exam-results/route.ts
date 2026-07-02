import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { ExamResultValidationError, hydrateStoredExamResult, prepareExamResultForStorage } from "@/lib/exam-result-storage";
import { requireApprovedUser, safeApiError } from "@/lib/server-auth";
import type { ExamResult, ExamResultDetailChunk, StoredExamResult } from "@/types/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const maxRequestBytes = 4_000_000;

export async function POST(request: Request) {
  try {
    const { ownerId } = await requireApprovedUser(request);
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > maxRequestBytes) {
      return NextResponse.json({ error: "This result is too large to submit safely." }, { status: 413 });
    }

    let body: { result?: ExamResult };
    try {
      body = JSON.parse(rawBody) as { result?: ExamResult };
    } catch {
      return NextResponse.json({ error: "The submitted result is not valid JSON." }, { status: 400 });
    }
    if (!body.result) return NextResponse.json({ error: "Exam result is required." }, { status: 400 });

    const { summary, chunks } = prepareExamResultForStorage(body.result, ownerId);
    const resultRef = adminDb.collection("examResults").doc(summary.resultId);
    const existing = await resultRef.get();
    if (existing.exists && existing.data()?.userId !== ownerId) {
      return NextResponse.json({ error: "This result belongs to another account." }, { status: 409 });
    }

    const detailsRef = resultRef.collection("details");
    const existingChunks = await detailsRef.get();
    const batch = adminDb.batch();
    for (const document of existingChunks.docs) batch.delete(document.ref);
    chunks.forEach((chunk) => batch.set(detailsRef.doc(chunkDocumentId(chunk.index)), chunk));
    batch.set(resultRef, summary);
    await batch.commit();

    return NextResponse.json({ ok: true, resultId: summary.resultId });
  } catch (error) {
    if (error instanceof ExamResultValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const safe = safeApiError(error, "Could not submit this exam.");
    return NextResponse.json({ error: safe.message }, { status: safe.status });
  }
}

export async function GET(request: Request) {
  try {
    const { appUser, ownerId } = await requireApprovedUser(request);
    const resultId = new URL(request.url).searchParams.get("resultId") || "";
    if (!/^[a-zA-Z0-9_-]{10,100}$/.test(resultId)) {
      return NextResponse.json({ error: "A valid result id is required." }, { status: 400 });
    }

    const resultRef = adminDb.collection("examResults").doc(resultId);
    const snapshot = await resultRef.get();
    if (!snapshot.exists) return NextResponse.json({ error: "Exam result not found." }, { status: 404 });

    const summary = snapshot.data() as StoredExamResult;
    if (appUser.role !== "admin" && summary.userId !== ownerId) {
      return NextResponse.json({ error: "You cannot view this result." }, { status: 403 });
    }

    if (Array.isArray(summary.questions) && Array.isArray(summary.answers)) {
      return NextResponse.json({ result: summary });
    }

    const chunkSnapshot = await resultRef.collection("details").orderBy("index").get();
    const chunks = chunkSnapshot.docs.map((item) => item.data() as ExamResultDetailChunk);
    if ((summary.detailChunkCount || 0) !== chunks.length) {
      return NextResponse.json({ error: "This result is still being finalized. Try again." }, { status: 409 });
    }

    return NextResponse.json({ result: hydrateStoredExamResult(summary, chunks) });
  } catch (error) {
    const safe = safeApiError(error, "Could not load this exam result.");
    return NextResponse.json({ error: safe.message }, { status: safe.status });
  }
}

function chunkDocumentId(index: number) {
  return `chunk-${String(index).padStart(4, "0")}`;
}
