import { cloudinaryConfig, signCloudinaryParams } from "@/lib/server-pdf-storage";

export function createProfileUploadSignature(ownerId: string) {
  const cloudinary = cloudinaryConfig();
  if (!cloudinary) return null;
  const publicId = `padlei/users/${ownerId}/profile`;
  const timestamp = Math.round(Date.now() / 1000);
  const params = {
    overwrite: true,
    public_id: publicId,
    timestamp,
    transformation: "c_fill,g_face,h_512,q_auto,w_512"
  };
  return {
    apiKey: cloudinary.apiKey,
    cloudName: cloudinary.cloudName,
    publicId,
    timestamp,
    transformation: params.transformation,
    signature: signCloudinaryParams(params, cloudinary.apiSecret),
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/image/upload`
  };
}

export async function deleteProfileImage(publicId: string) {
  const cloudinary = cloudinaryConfig();
  if (!cloudinary) return;
  const timestamp = Math.round(Date.now() / 1000);
  const params = { invalidate: true, public_id: publicId, timestamp };
  const form = new FormData();
  form.append("api_key", cloudinary.apiKey);
  form.append("timestamp", String(timestamp));
  form.append("public_id", publicId);
  form.append("invalidate", "true");
  form.append("signature", signCloudinaryParams(params, cloudinary.apiSecret));
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/image/destroy`, {
    method: "POST",
    body: form
  });
  if (!response.ok) throw new Error("Could not remove the previous profile image.");
}
