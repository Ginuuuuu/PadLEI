import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireApprovedUser, safeApiError } from "@/lib/server-auth";
import { deleteProfileImage } from "@/lib/server-profile-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { decoded, appUser, ownerId } = await requireApprovedUser(request);
    const body = (await request.json()) as Record<string, unknown>;
    const allowed = new Set([
      "name",
      "bio",
      "currentSemesterId",
      "university",
      "course",
      "profilePhotoUrl",
      "profilePhotoPublicId",
      "removePhoto"
    ]);
    if (Object.keys(body).some((key) => !allowed.has(key))) {
      return NextResponse.json({ error: "Unexpected fields were submitted." }, { status: 400 });
    }

    const removePhoto = body.removePhoto === true;
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : appUser.name || "";
    const bio = typeof body.bio === "string" ? body.bio.trim().slice(0, 300) : appUser.bio || "";
    const university = typeof body.university === "string" ? body.university.trim().slice(0, 120) : appUser.university || "";
    const course = typeof body.course === "string" ? body.course.trim().slice(0, 120) : appUser.course || "";
    const currentSemesterId = typeof body.currentSemesterId === "string" ? body.currentSemesterId.slice(0, 100) : appUser.currentSemesterId || "";
    const expectedPublicId = `padlei/users/${ownerId}/profile`;
    const profilePhotoPublicId = typeof body.profilePhotoPublicId === "string" ? body.profilePhotoPublicId : "";
    const profilePhotoUrl = typeof body.profilePhotoUrl === "string" ? body.profilePhotoUrl : "";
    if (profilePhotoPublicId && profilePhotoPublicId !== expectedPublicId) {
      return NextResponse.json({ error: "Profile image does not match this account." }, { status: 403 });
    }
    if (profilePhotoUrl && !/^https:\/\/res\.cloudinary\.com\//.test(profilePhotoUrl)) {
      return NextResponse.json({ error: "Profile image URL is invalid." }, { status: 400 });
    }

    if (removePhoto && appUser.profilePhotoPublicId) {
      await deleteProfileImage(appUser.profilePhotoPublicId);
    }

    const update = {
      name,
      bio,
      university,
      course,
      currentSemesterId,
      ...(removePhoto
        ? { profilePhotoUrl: FieldValue.delete(), profilePhotoPublicId: FieldValue.delete() }
        : profilePhotoUrl && profilePhotoPublicId
          ? { profilePhotoUrl, profilePhotoPublicId }
          : {}),
      updatedAt: new Date().toISOString()
    };
    const relatedUsers = await adminDb.collection("users").where("ownerId", "==", ownerId).get();
    const batch = adminDb.batch();
    batch.set(adminDb.collection("users").doc(decoded.uid), update, { merge: true });
    for (const user of relatedUsers.docs) batch.set(user.ref, update, { merge: true });
    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const safe = safeApiError(error, "Could not update profile.");
    return NextResponse.json({ error: safe.message }, { status: safe.status });
  }
}
