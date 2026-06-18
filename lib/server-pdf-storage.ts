import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { adminBucket, adminBucketNames, adminStorage } from "@/lib/firebase-admin";

const runtimeDataRoot =
  process.env.VERCEL || process.env.NODE_ENV === "production"
    ? resolve(tmpdir(), "padlei")
    : resolve(process.cwd(), "data");
const localRoot = resolve(runtimeDataRoot, "local-pdfs");
const cloudinaryCacheRoot = resolve(runtimeDataRoot, "cloudinary-cache");

function safeName(name: string) {
  return name.replace(/[^\w.\-() ]+/g, "_");
}

function safeCloudinaryId(name: string) {
  return name.replace(/[^\w.\-()/]+/g, "_").replace(/^\/+|\/+$/g, "");
}

export function cloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret };
}

export function signCloudinaryParams(params: Record<string, string | number | boolean>, apiSecret: string) {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return createHash("sha1").update(`${payload}${apiSecret}`).digest("hex");
}

export function isCloudinaryPdfPath(storagePath: string) {
  return storagePath.startsWith("cloudinary/");
}

export function isCloudinaryImagePdfPath(storagePath: string) {
  return storagePath.startsWith("cloudinary/image/");
}

function cloudinaryResourceType(storagePath: string) {
  return storagePath.startsWith("cloudinary/raw/") ? "raw" : "image";
}

function cloudinaryPublicId(storagePath: string) {
  return storagePath.replace(/^cloudinary\/(?:raw|image)\//, "").replace(/^cloudinary\//, "");
}

function cloudinaryDeliveryUrl(storagePath: string, cloudName?: string) {
  const resolvedCloudName = cloudName || process.env.CLOUDINARY_CLOUD_NAME?.trim();
  if (!resolvedCloudName) throw new Error("Cloudinary cloud name is missing.");
  const publicId = encodedCloudinaryPublicId(cloudinaryPublicId(storagePath));
  const resourceType = cloudinaryResourceType(storagePath);
  return `https://res.cloudinary.com/${resolvedCloudName}/${resourceType}/upload/${publicId}${resourceType === "image" ? ".pdf" : ""}`;
}

export function createCloudinaryPdfUploadSignature({
  userId,
  pdfId,
  fileName
}: {
  userId: string;
  pdfId: string;
  fileName: string;
}) {
  const cloudinary = cloudinaryConfig();
  if (!cloudinary) return null;

  const publicId = safeCloudinaryId(`study-pdfs/${userId}/${pdfId}-${fileName.replace(/\.pdf$/i, "")}.pdf`);
  const timestamp = Math.round(Date.now() / 1000);
  const params = {
    overwrite: true,
    public_id: publicId,
    timestamp
  };
  const signature = signCloudinaryParams(params, cloudinary.apiSecret);

  return {
    apiKey: cloudinary.apiKey,
    bucketName: cloudinary.cloudName,
    cloudName: cloudinary.cloudName,
    publicId,
    signature,
    storagePath: `cloudinary/raw/${publicId}`,
    timestamp,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/raw/upload`
  };
}

function encodedCloudinaryPublicId(publicId: string) {
  return publicId.split("/").map(encodeURIComponent).join("/");
}

export function cloudinaryPageImageUrl(storagePath: string, pageNumber: number, cloudName?: string) {
  const resolvedCloudName = cloudName || process.env.CLOUDINARY_CLOUD_NAME?.trim();
  if (!resolvedCloudName) throw new Error("Cloudinary cloud name is missing.");
  return `https://res.cloudinary.com/${resolvedCloudName}/image/upload/pg_${pageNumber},f_png,q_auto:best/${encodedCloudinaryPublicId(cloudinaryPublicId(storagePath))}.png`;
}

function localFilePath(storagePath: string) {
  const relativePath = storagePath.replace(/^local\//, "").split("/").map(safeName).join("/");
  const target = resolve(localRoot, relativePath);
  if (!target.startsWith(localRoot)) throw new Error("Invalid local PDF path.");
  return target;
}

function cloudinaryCachePath(storagePath: string) {
  const publicId = cloudinaryPublicId(storagePath);
  const relativePath = (publicId.toLowerCase().endsWith(".pdf") ? publicId : `${publicId}.pdf`).split("/").map(safeName).join("/");
  const target = resolve(cloudinaryCacheRoot, relativePath);
  if (!target.startsWith(cloudinaryCacheRoot)) throw new Error("Invalid Cloudinary cache path.");
  return target;
}

async function writeCloudinaryCache(storagePath: string, buffer: Buffer) {
  try {
    const target = cloudinaryCachePath(storagePath);
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, buffer);
  } catch {
    // The cache is only a local speed-up; upload/extraction still works without it.
  }
}

async function readCloudinaryCache(storagePath: string) {
  return readFile(cloudinaryCachePath(storagePath));
}

async function deleteCloudinaryCache(storagePath: string) {
  await rm(cloudinaryCachePath(storagePath), { force: true }).catch(() => undefined);
}

function shouldUseLocalFallback(error: unknown) {
  if (process.env.NODE_ENV === "production") return false;
  const message = error instanceof Error ? error.message : String(error);
  return /bucket.*does not exist|specified bucket does not exist|not found/i.test(message);
}

export function isLocalPdfPath(storagePath: string) {
  return storagePath.startsWith("local/");
}

export function bucketNameFromFileUrl(fileUrl?: string) {
  const match = fileUrl?.match(/^gs:\/\/([^/]+)\//);
  return match?.[1];
}

export function getPdfBucket(bucketName?: string) {
  return adminStorage.bucket((bucketName || adminBucket.name).trim());
}

export async function savePdfBuffer({
  userId,
  pdfId,
  fileName,
  buffer
}: {
  userId: string;
  pdfId: string;
  fileName: string;
  buffer: Buffer;
}) {
  const cloudinary = cloudinaryConfig();
  if (cloudinary) {
    try {
      const publicId = safeCloudinaryId(`study-pdfs/${userId}/${pdfId}-${fileName.replace(/\.pdf$/i, "")}.pdf`);
      const timestamp = Math.round(Date.now() / 1000);
      const params = {
        overwrite: true,
        public_id: publicId,
        timestamp
      };
      const signature = signCloudinaryParams(params, cloudinary.apiSecret);
      const form = new FormData();
      const bytes = new Uint8Array(buffer.byteLength);
      bytes.set(buffer);
      form.append("file", new Blob([bytes.buffer], { type: "application/pdf" }), fileName);
      form.append("api_key", cloudinary.apiKey);
      form.append("timestamp", String(timestamp));
      form.append("public_id", publicId);
      form.append("overwrite", "true");
      form.append("signature", signature);

      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/raw/upload`, {
        method: "POST",
        body: form
      });

      const payload = (await response.json().catch(() => ({}))) as { secure_url?: string; error?: { message?: string } };
      if (!response.ok || !payload.secure_url) {
        throw new Error(`Cloudinary upload failed: ${payload.error?.message || response.statusText}`);
      }

      const storagePath = `cloudinary/raw/${publicId}`;
      await writeCloudinaryCache(storagePath, buffer);

      return {
        bucketName: cloudinary.cloudName,
        storagePath,
        fileUrl: payload.secure_url,
        provider: "cloudinary" as const,
        localFallback: false
      };
    } catch (error) {
      throw error;
    }
  }

  const objectPath = `users/${userId}/pdfs/${pdfId}-${safeName(fileName)}`;
  let lastError: unknown;

  for (const bucketName of adminBucketNames) {
    try {
      const bucket = adminStorage.bucket(bucketName);
      await bucket.file(objectPath).save(buffer, {
        resumable: false,
        contentType: "application/pdf",
        metadata: { cacheControl: "private, max-age=0" }
      });

      return {
        bucketName,
        storagePath: objectPath,
        fileUrl: `gs://${bucketName}/${objectPath}`,
        provider: "firebase" as const,
        localFallback: false
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (!shouldUseLocalFallback(lastError)) {
    throw lastError instanceof Error ? lastError : new Error("PDF upload failed.");
  }

  const storagePath = `local/users/${userId}/pdfs/${pdfId}-${safeName(fileName)}`;
  const target = localFilePath(storagePath);
  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, buffer);

  return {
    bucketName: "local",
    storagePath,
    fileUrl: `local://${basename(target)}`,
    provider: "local" as const,
    localFallback: true
  };
}

export async function readPdfBuffer(storagePath: string, bucketName?: string, fileUrl?: string) {
  if (isLocalPdfPath(storagePath)) {
    return readFile(localFilePath(storagePath));
  }

  if (isCloudinaryPdfPath(storagePath)) {
    const response = await fetch(fileUrl || cloudinaryDeliveryUrl(storagePath, bucketName));
    if (!response.ok) {
      try {
        return await readCloudinaryCache(storagePath);
      } catch {
        throw new Error(
          `Cloudinary download failed: ${response.statusText}. Delete this PDF and re-upload it so PadLEI can store it through the fixed Cloudinary PDF path.`
        );
      }
    }
    return Buffer.from(await response.arrayBuffer());
  }

  const [buffer] = await getPdfBucket(bucketName).file(storagePath).download();
  return buffer;
}

export async function deletePdfFile(storagePath: string, bucketName?: string) {
  if (isLocalPdfPath(storagePath)) {
    await rm(localFilePath(storagePath), { force: true });
    return;
  }

  if (isCloudinaryPdfPath(storagePath)) {
    await deleteCloudinaryCache(storagePath);
    const cloudinary = cloudinaryConfig();
    if (!cloudinary) return;
    const publicId = cloudinaryPublicId(storagePath);
    const timestamp = Math.round(Date.now() / 1000);
    const params = {
      invalidate: true,
      public_id: publicId,
      timestamp
    };
    const signature = signCloudinaryParams(params, cloudinary.apiSecret);
    const form = new FormData();
    form.append("api_key", cloudinary.apiKey);
    form.append("timestamp", String(timestamp));
    form.append("public_id", publicId);
    form.append("invalidate", "true");
    form.append("signature", signature);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/${cloudinaryResourceType(storagePath)}/destroy`, {
      method: "POST",
      body: form
    });
    if (!response.ok) throw new Error(`Cloudinary delete failed: ${response.statusText}`);
    return;
  }

  await getPdfBucket(bucketName).file(storagePath).delete({ ignoreNotFound: true });
}
