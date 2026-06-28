import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { normalizeEmail } from "@/lib/account";
import type { AppUser } from "@/types/models";

export type AuthorizedUser = {
  decoded: DecodedIdToken;
  appUser: AppUser;
  ownerId: string;
};

export class ApiAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export async function requireApprovedUser(request: Request, options?: { admin?: boolean }): Promise<AuthorizedUser> {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) throw new ApiAuthError("Login required.", 401);

  let decoded: DecodedIdToken;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    throw new ApiAuthError("Your login has expired. Please sign in again.", 401);
  }

  const snapshot = await adminDb.collection("users").doc(decoded.uid).get();
  if (!snapshot.exists || snapshot.data()?.approved !== true) {
    throw new ApiAuthError("Approved user access required.", 403);
  }

  const record = snapshot.data() as AppUser;
  if (options?.admin && record.role !== "admin") {
    throw new ApiAuthError("Administrator access required.", 403);
  }

  const email = normalizeEmail(decoded.email || record.email || "");
  const appUser: AppUser = {
    ...record,
    uid: decoded.uid,
    ownerId: record.ownerId || decoded.uid,
    email,
    normalizedEmail: record.normalizedEmail || email
  };

  return { decoded, appUser, ownerId: appUser.ownerId };
}

export function safeApiError(error: unknown, fallback: string) {
  if (error instanceof ApiAuthError) {
    return { message: error.message, status: error.status };
  }
  return { message: error instanceof Error ? error.message : fallback, status: 500 };
}
