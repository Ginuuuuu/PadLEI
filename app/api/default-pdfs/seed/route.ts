import { NextResponse } from "next/server";
import seed from "@/lib/default-pdfs/kyrgyz-test-option-a-highlighted.json";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { questionCounts } from "@/lib/question-options";
import type { PdfFile, Question } from "@/types/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type DefaultSeedQuestion = Omit<Question, "id" | "pdfId" | "userId" | "questionId">;

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Login required." }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userDoc.exists || userDoc.data()?.approved !== true) {
      return NextResponse.json({ error: "Approved user access required." }, { status: 403 });
    }

    const seedVersion = seed.version;
    const pdfId = `${seed.defaultKey}_${decoded.uid}`;
    const pdfRef = adminDb.collection("pdfs").doc(pdfId);
    const existing = await pdfRef.get();

    if (existing.exists && existing.data()?.defaultVersion === seedVersion && (existing.data()?.totalQuestions || 0) > 0) {
      return NextResponse.json({ seeded: false, pdfId, totalQuestions: existing.data()?.totalQuestions || 0 });
    }

    const questions = (seed.questions as DefaultSeedQuestion[]).map((question) => {
      const id = `${pdfId}_${question.questionNumber}`;
      return {
        ...question,
        id,
        questionId: id,
        pdfId,
        userId: decoded.uid,
        status: "ready" as const,
        correctAnswer: question.correctAnswer || "A",
        confidence: question.confidence ?? 0.98,
        extractionNote: question.extractionNote || "Default Kyrgyz question."
      } satisfies Question;
    });
    const counts = questionCounts(questions);
    const uploadedAt = new Date().toISOString();
    const pdf = {
      pdfId,
      userId: decoded.uid,
      fileName: seed.fileName,
      fileUrl: seed.fileUrl,
      storagePath: seed.storagePath,
      storageProvider: "local",
      uploadedAt,
      status: "completed",
      totalQuestions: questions.length,
      readyQuestions: counts.readyQuestions,
      needsReviewQuestions: counts.needsReviewQuestions,
      errorMessage: "",
      defaultKey: seed.defaultKey,
      defaultVersion: seedVersion
    } satisfies PdfFile & { defaultKey: string; defaultVersion: string };

    const existingQuestions = await adminDb.collection("questions").where("pdfId", "==", pdfId).get();
    const writer = adminDb.bulkWriter();
    existingQuestions.docs.forEach((question) => writer.delete(question.ref));
    writer.set(pdfRef, pdf);
    questions.forEach((question) => writer.set(adminDb.collection("questions").doc(question.id), question));
    await writer.close();

    return NextResponse.json({
      seeded: true,
      pdfId,
      totalQuestions: questions.length,
      readyQuestions: counts.readyQuestions
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not add default PDF." }, { status: 500 });
  }
}
