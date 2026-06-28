import { readFile } from "node:fs/promises";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const apply = process.argv.includes("--apply");
if (apply && process.env.PADLEI_ALLOW_MIGRATION !== "true") {
  throw new Error("Set PADLEI_ALLOW_MIGRATION=true before using --apply.");
}

const credential = await loadCredential();
const app = getApps()[0] || initializeApp(credential ? { credential } : undefined);
const db = getFirestore(app);
const academicCollections = [
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
];

console.log(`PadLEI migration mode: ${apply ? "APPLY" : "DRY RUN"}`);
const usersSnapshot = await db.collection("users").get();
const groups = new Map();
for (const document of usersSnapshot.docs) {
  const data = document.data();
  const email = String(data.normalizedEmail || data.email || "").trim().toLowerCase();
  if (!email) continue;
  const values = groups.get(email) || [];
  values.push({ document, data });
  groups.set(email, values);
}

let passwordFieldsRemoved = 0;
const requests = await db.collection("loginRequests").get();
for (const request of requests.docs) {
  const data = request.data();
  const update = {};
  if ("preferredPassword" in data) {
    update.preferredPassword = FieldValue.delete();
    passwordFieldsRemoved += 1;
  }
  if ("confirmPassword" in data) update.confirmPassword = FieldValue.delete();
  if (!data.email && data.gmail) {
    update.email = String(data.gmail).trim().toLowerCase();
    update.gmail = FieldValue.delete();
  }
  if (!data.contactMethod) update.contactMethod = "email";
  if (apply && Object.keys(update).length) await request.ref.set(update, { merge: true });
}

let migratedRecords = 0;
let migratedProgress = 0;
for (const [email, candidates] of groups) {
  candidates.sort((a, b) => String(a.data.createdAt || "").localeCompare(String(b.data.createdAt || "")));
  const ownerId = candidates.find((candidate) => candidate.data.ownerId)?.data.ownerId
    || candidates.find((candidate) => candidate.data.approved === true)?.document.id
    || candidates[0].document.id;
  const sourceOwnerIds = Array.from(new Set(candidates.flatMap((candidate) => [candidate.document.id, candidate.data.ownerId]).filter((value) => value && value !== ownerId)));

  console.log(`${email}: owner=${ownerId}, legacy owners=${sourceOwnerIds.length}`);
  if (apply) {
    const batch = db.batch();
    for (const candidate of candidates) {
      batch.set(candidate.document.ref, { ownerId, normalizedEmail: email, updatedAt: new Date().toISOString() }, { merge: true });
    }
    const approvalRef = db.collection("approvals").doc(email);
    const approval = await approvalRef.get();
    batch.set(approvalRef, {
      email,
      normalizedEmail: email,
      ownerId,
      approved: approval.data()?.approved ?? candidates.some((candidate) => candidate.data.approved === true),
      role: approval.data()?.role || candidates.find((candidate) => candidate.data.role)?.data.role || "user",
      createdAt: approval.data()?.createdAt || candidates[0].data.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
    await batch.commit();
  }

  for (const sourceOwnerId of sourceOwnerIds) {
    for (const collectionName of academicCollections) {
      const snapshot = await db.collection(collectionName).where("userId", "==", sourceOwnerId).get();
      migratedRecords += snapshot.size;
      if (!apply || snapshot.empty) continue;
      await commitInChunks(snapshot.docs.map((document) => ({
        ref: document.ref,
        data: { userId: ownerId, migratedFromOwnerId: sourceOwnerId }
      })));
    }

    const progressSnapshot = await db.collection("progress").where("userId", "==", sourceOwnerId).get();
    migratedProgress += progressSnapshot.size;
    if (apply) {
      for (const progress of progressSnapshot.docs) {
        const data = progress.data();
        const pdfId = String(data.pdfId || progress.id.replace(`${sourceOwnerId}_`, ""));
        const target = db.collection("progress").doc(`${ownerId}_${pdfId}`);
        const existing = await target.get();
        const targetData = existing.data() || {};
        await target.set({
          ...data,
          userId: ownerId,
          pdfId,
          studiedQuestions: mergeArrays(targetData.studiedQuestions, data.studiedQuestions),
          learnedQuestions: mergeArrays(targetData.learnedQuestions, data.learnedQuestions),
          bookmarkedQuestions: mergeArrays(targetData.bookmarkedQuestions, data.bookmarkedQuestions),
          weakQuestions: mergeArrays(targetData.weakQuestions, data.weakQuestions),
          bestScore: Math.max(Number(targetData.bestScore || 0), Number(data.bestScore || 0)),
          migratedFromOwnerId: sourceOwnerId,
          migratedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      }
    }
  }

  const pdfs = await db.collection("pdfs").where("userId", "==", ownerId).get();
  const uncategorized = pdfs.docs.filter((document) => !document.data().semesterId || !document.data().subjectId);
  if (apply && uncategorized.length) {
    await commitInChunks(uncategorized.map((document) => ({
      ref: document.ref,
      data: {
        semesterId: "uncategorized",
        semesterName: "Uncategorized",
        subjectId: "general",
        subjectName: "General"
      }
    })));
  }

  if (apply) {
    await db.collection("accountMigrations").doc(`bulk_${ownerId}`).set({
      migrationId: `bulk_${ownerId}`,
      ownerId,
      normalizedEmail: email,
      sourceOwnerIds,
      status: "completed",
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  }
}

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  accounts: groups.size,
  passwordFieldsRemoved,
  migratedRecords,
  migratedProgress
}, null, 2));

async function commitInChunks(items) {
  for (let index = 0; index < items.length; index += 400) {
    const batch = db.batch();
    for (const item of items.slice(index, index + 400)) batch.set(item.ref, item.data, { merge: true });
    await batch.commit();
  }
}

function mergeArrays(left, right) {
  return Array.from(new Set([...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])].filter((value) => typeof value === "string")));
}

async function loadCredential() {
  if (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    return cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n")
    });
  }
  if (process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_PATH) {
    const contents = await readFile(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_PATH, "utf8");
    return cert(JSON.parse(contents));
  }
  return undefined;
}
