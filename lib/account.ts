import type { AppUser } from "@/types/models";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function dataOwnerId(user: Pick<AppUser, "uid" | "ownerId">) {
  return user.ownerId || user.uid;
}
