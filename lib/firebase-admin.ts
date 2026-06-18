import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function privateKey() {
  return process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
}

function serviceAccountFromFile() {
  const serviceAccountPath = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_PATH?.trim();
  if (!serviceAccountPath || process.env.VERCEL) return null;

  try {
    const contents = readFileSync(serviceAccountPath, "utf8");
    return JSON.parse(contents) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
  } catch {
    return null;
  }
}

const serviceAccount = serviceAccountFromFile();
export const adminProjectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || serviceAccount?.project_id || "";
const configuredBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
export const adminBucketNames = Array.from(
  new Set([configuredBucket, adminProjectId ? `${adminProjectId}.appspot.com` : "", adminProjectId ? `${adminProjectId}.firebasestorage.app` : ""].filter(Boolean))
);
const credential =
  process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && privateKey()
    ? cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: privateKey()
      })
    : serviceAccount
      ? cert({
          projectId: serviceAccount.project_id,
          clientEmail: serviceAccount.client_email,
          privateKey: serviceAccount.private_key
        })
    : undefined;

const adminApp =
  getApps()[0] ||
  (credential
    ? initializeApp({
        credential,
        ...(adminBucketNames[0] ? { storageBucket: adminBucketNames[0] } : {})
      })
    : initializeApp(adminBucketNames[0] ? { storageBucket: adminBucketNames[0] } : undefined));

export const adminDb = getFirestore(adminApp);
export const adminAuth = getAuth(adminApp);
export const adminStorage = getStorage(adminApp);
export const adminBucket = adminStorage.bucket(adminBucketNames[0]);
