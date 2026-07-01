import { NextResponse } from "next/server";
import histologySeed from "@/lib/default-pdfs/histology-osh-2025-2026.json";
import kyrgyzSeed from "@/lib/default-pdfs/kyrgyz-test-option-a-highlighted.json";
import physiologySeed from "@/lib/default-pdfs/physiology.json";
import { adminDb } from "@/lib/firebase-admin";
import { questionCounts, questionStatus } from "@/lib/question-options";
import { requireApprovedUser, safeApiError } from "@/lib/server-auth";
import type { PdfFile, Question } from "@/types/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type DefaultSeedQuestion = Omit<Question, "id" | "pdfId" | "userId" | "questionId">;
type DefaultSeed = {
  defaultKey: string;
  version: string;
  fileName: string;
  fileUrl: string;
  storagePath: string;
  semesterId?: string;
  semesterName?: string;
  subjectId?: string;
  subjectName?: string;
  questions: DefaultSeedQuestion[];
};

const defaultSeeds: DefaultSeed[] = [kyrgyzSeed, physiologySeed, histologySeed] as DefaultSeed[];

export async function POST(request: Request) {
  try {
    const { ownerId } = await requireApprovedUser(request);

    const results = [];
    for (const seed of defaultSeeds) {
      results.push(await seedDefaultPdf(seed, ownerId));
    }

    return NextResponse.json({
      seeded: results.some((result) => result.seeded),
      results,
      totalQuestions: results.reduce((total, result) => total + result.totalQuestions, 0),
      readyQuestions: results.reduce((total, result) => total + result.readyQuestions, 0)
    });
  } catch (error) {
    const safe = safeApiError(error, "Could not add default PDF.");
    return NextResponse.json({ error: safe.message }, { status: safe.status });
  }
}

async function seedDefaultPdf(seed: DefaultSeed, userId: string) {
  const seedVersion = seed.version;
  const pdfId = `${seed.defaultKey}_${userId}`;
  const pdfRef = adminDb.collection("pdfs").doc(pdfId);
  const existing = await pdfRef.get();

  if (existing.exists && existing.data()?.defaultVersion === seedVersion && (existing.data()?.totalQuestions || 0) > 0) {
    return {
      seeded: false,
      pdfId,
      fileName: seed.fileName,
      totalQuestions: existing.data()?.totalQuestions || 0,
      readyQuestions: existing.data()?.readyQuestions || 0
    };
  }

  const questions = seed.questions.map((question) => {
    const id = `${pdfId}_${question.questionNumber}`;
    const baseQuestion = {
      ...question,
      id,
      questionId: id,
      pdfId,
      userId,
      correctAnswer: question.correctAnswer || "",
      confidence: question.confidence ?? (question.correctAnswer ? 0.98 : 0.4),
      extractionNote: question.extractionNote || `Default ${seed.fileName} question.`
    } satisfies Question;
    const explicitStatus = question.status === "ready" || question.status === "needsReview" || question.status === "needs_review" || question.status === "failed" ? question.status : undefined;

    return {
      ...baseQuestion,
      status: explicitStatus || questionStatus(baseQuestion)
    } satisfies Question;
  });
  const counts = questionCounts(questions);
  const uploadedAt = new Date().toISOString();
  const pdf = {
    pdfId,
    userId,
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
    semesterId: seed.semesterId || "uncategorized",
    semesterName: seed.semesterName || "Uncategorized",
    subjectId: seed.subjectId || "general",
    subjectName: seed.subjectName || "General",
    defaultKey: seed.defaultKey,
    defaultVersion: seedVersion
  } satisfies PdfFile & { defaultKey: string; defaultVersion: string };

  const existingQuestions = await adminDb.collection("questions").where("pdfId", "==", pdfId).get();
  const writer = adminDb.bulkWriter();
  existingQuestions.docs.forEach((question) => writer.delete(question.ref));
  writer.set(pdfRef, pdf);
  questions.forEach((question) => writer.set(adminDb.collection("questions").doc(question.id), question));
  await writer.close();

  return {
    seeded: true,
    pdfId,
    fileName: seed.fileName,
    totalQuestions: questions.length,
    readyQuestions: counts.readyQuestions
  };
}
