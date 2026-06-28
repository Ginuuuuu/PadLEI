import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { normalizeEmail } from "@/lib/account";
import type { AppUser, UserRole } from "@/types/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ownerCollections = [
  "pdfs",
  "questions",
  "examResults",
  "quotes",
  "semesters",
  "subjects",
  "examTimetable",
  "actualExamScores",
  "userPreferences",
  "reminderAcknowledgements"
] as const;

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return NextResponse.json({ error: "Login required." }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const email = normalizeEmail(decoded.email || "");
    if (!email) return NextResponse.json({ error: "Authenticated email is required." }, { status: 400 });

    const body = await request.json().catch(() => ({})) as { dryRun?: boolean };
    const dryRun = body.dryRun === true;
    const approval = await adminDb.collection("approvals").doc(email).get();
    const approvalData = approval.data() as { approved?: boolean; role?: UserRole; ownerId?: string; createdAt?: string } | undefined;
    const candidates = await findUserCandidates(email);
    const current = candidates.find((candidate) => candidate.id === decoded.uid);
    const approvedCandidate = candidates.find((candidate) => candidate.data.approved === true);
    const bootstrapEmail = normalizeEmail(process.env.NEXT_PUBLIC_BOOTSTRAP_ADMIN_EMAIL || "");
    const approved = approvalData?.approved === true || approvedCandidate?.data.approved === true || email === bootstrapEmail;

    if (!approved) {
      return NextResponse.json({ error: "Access denied. Ask an administrator to approve this email." }, { status: 403 });
    }

    const sortedCandidates = [...candidates].sort((a, b) =>
      String(a.data.createdAt || "").localeCompare(String(b.data.createdAt || ""))
    );
    const ownerId =
      approvalData?.ownerId ||
      current?.data.ownerId ||
      sortedCandidates.find((candidate) => candidate.data.ownerId)?.data.ownerId ||
      sortedCandidates.find((candidate) => candidate.data.approved)?.id ||
      decoded.uid;
    const now = new Date().toISOString();
    const role: UserRole =
      email === bootstrapEmail ? "admin" : approvalData?.role || approvedCandidate?.data.role || current?.data.role || "user";
    const createdAt = current?.data.createdAt || approvedCandidate?.data.createdAt || approvalData?.createdAt || now;
    const canonicalUser: AppUser = {
      ...(approvedCandidate?.data || {}),
      ...(current?.data || {}),
      uid: decoded.uid,
      ownerId,
      email,
      normalizedEmail: email,
      name: decoded.name || current?.data.name || approvedCandidate?.data.name || "",
      role,
      approved: true,
      createdAt,
      updatedAt: now
    };

    const legacyOwnerIds = Array.from(
      new Set(
        candidates
          .flatMap((candidate) => [candidate.id, candidate.data.ownerId])
          .filter((value): value is string => Boolean(value) && value !== ownerId)
      )
    );
    const migrationId = `${ownerId}_${decoded.uid}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    const migrationRef = adminDb.collection("accountMigrations").doc(migrationId);
    const migrationSnapshot = await migrationRef.get();
    let migratedRecords = 0;

    if (!dryRun && migrationSnapshot.data()?.status !== "completed") {
      migratedRecords = await migrateAcademicRecords(legacyOwnerIds, ownerId);
      await migrateProgress(legacyOwnerIds, ownerId);
    }
    if (!dryRun) await ensureDefaultAcademicCatalog(ownerId);

    if (!dryRun) {
      const batch = adminDb.batch();
      batch.set(adminDb.collection("users").doc(decoded.uid), canonicalUser, { merge: true });
      for (const candidate of candidates) {
        batch.set(candidate.ref, { ownerId, normalizedEmail: email, updatedAt: now }, { merge: true });
      }
      batch.set(
        adminDb.collection("approvals").doc(email),
        { email, normalizedEmail: email, ownerId, role, approved: true, createdAt, updatedAt: now },
        { merge: true }
      );
      batch.set(
        migrationRef,
        {
          migrationId,
          authUid: decoded.uid,
          ownerId,
          normalizedEmail: email,
          sourceOwnerIds: legacyOwnerIds,
          migratedRecords,
          status: "completed",
          completedAt: now,
          updatedAt: now
        },
        { merge: true }
      );
      await batch.commit();
    }

    return NextResponse.json({ user: canonicalUser, migration: { dryRun, migratedRecords, legacyOwnerIds } });
  } catch (error) {
    const message = error instanceof Error && /token|auth/i.test(error.message)
      ? "Your login has expired. Please sign in again."
      : "Account synchronization could not be completed.";
    return NextResponse.json({ error: message }, { status: message.includes("expired") ? 401 : 500 });
  }
}

async function findUserCandidates(email: string) {
  const snapshots = await Promise.all([
    adminDb.collection("users").where("normalizedEmail", "==", email).get(),
    adminDb.collection("users").where("email", "==", email).get()
  ]);
  const candidates = new Map<string, { id: string; ref: FirebaseFirestore.DocumentReference; data: AppUser }>();
  for (const snapshot of snapshots) {
    for (const document of snapshot.docs) {
      candidates.set(document.id, { id: document.id, ref: document.ref, data: document.data() as AppUser });
    }
  }
  return [...candidates.values()];
}

async function migrateAcademicRecords(sourceOwnerIds: string[], ownerId: string) {
  let migrated = 0;
  for (const collectionName of ownerCollections) {
    for (const sourceOwnerId of sourceOwnerIds) {
      const snapshot = await adminDb.collection(collectionName).where("userId", "==", sourceOwnerId).get();
      if (snapshot.empty) continue;
      let batch = adminDb.batch();
      let operations = 0;
      for (const document of snapshot.docs) {
        batch.set(document.ref, { userId: ownerId, migratedFromOwnerId: sourceOwnerId }, { merge: true });
        operations += 1;
        migrated += 1;
        if (operations === 400) {
          await batch.commit();
          batch = adminDb.batch();
          operations = 0;
        }
      }
      if (operations) await batch.commit();
    }
  }
  return migrated;
}

async function migrateProgress(sourceOwnerIds: string[], ownerId: string) {
  for (const sourceOwnerId of sourceOwnerIds) {
    const snapshot = await adminDb.collection("progress").where("userId", "==", sourceOwnerId).get();
    for (const document of snapshot.docs) {
      const data = document.data();
      const pdfId = String(data.pdfId || document.id.replace(`${sourceOwnerId}_`, ""));
      const target = adminDb.collection("progress").doc(`${ownerId}_${pdfId}`);
      const targetSnapshot = await target.get();
      const targetData = targetSnapshot.data() || {};
      await target.set(
        {
          ...data,
          userId: ownerId,
          pdfId,
          studiedQuestions: mergeStringArrays(targetData.studiedQuestions, data.studiedQuestions),
          learnedQuestions: mergeStringArrays(targetData.learnedQuestions, data.learnedQuestions),
          bookmarkedQuestions: mergeStringArrays(targetData.bookmarkedQuestions, data.bookmarkedQuestions),
          weakQuestions: mergeStringArrays(targetData.weakQuestions, data.weakQuestions),
          bestScore: Math.max(Number(targetData.bestScore || 0), Number(data.bestScore || 0)),
          migratedFromOwnerId: sourceOwnerId,
          migratedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }
  }
}

function mergeStringArrays(left: unknown, right: unknown) {
  const values = [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])];
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string")));
}

async function ensureDefaultAcademicCatalog(ownerId: string) {
  const now = new Date().toISOString();
  await Promise.all([
    adminDb.collection("semesters").doc(`${ownerId}_uncategorized`).set(
      {
        semesterId: "uncategorized",
        userId: ownerId,
        name: "Uncategorized",
        normalizedName: "uncategorized",
        isCustom: false,
        createdAt: now,
        updatedAt: now
      },
      { merge: true }
    ),
    adminDb.collection("subjects").doc(`${ownerId}_uncategorized_general`).set(
      {
        subjectId: "general",
        userId: ownerId,
        semesterId: "uncategorized",
        semesterName: "Uncategorized",
        name: "General",
        normalizedName: "general",
        isCustom: false,
        createdAt: now,
        updatedAt: now
      },
      { merge: true }
    )
  ]);

  const pdfs = await adminDb.collection("pdfs").where("userId", "==", ownerId).get();
  let batch = adminDb.batch();
  let operations = 0;
  for (const document of pdfs.docs) {
    const data = document.data();
    if (data.semesterId && data.subjectId) continue;
    batch.set(
      document.ref,
      {
        semesterId: data.semesterId || "uncategorized",
        semesterName: data.semesterName || "Uncategorized",
        subjectId: data.subjectId || "general",
        subjectName: data.subjectName || "General"
      },
      { merge: true }
    );
    operations += 1;
    if (operations === 400) {
      await batch.commit();
      batch = adminDb.batch();
      operations = 0;
    }
  }
  if (operations) await batch.commit();
}
