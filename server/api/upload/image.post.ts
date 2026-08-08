import { requireAdmin } from "~~/server/utils/auth-guard";
import { uploadImageToR2, generateImageKey } from "~~/server/utils/r2";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const formData = await readMultipartFormData(event);
  if (!formData) {
    throw createError({
      statusCode: 400,
      statusMessage: "No file uploaded",
    });
  }

  const file = formData.find((item) => item.name === "image");
  if (!file || !file.data || file.data.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "Image file is required",
    });
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type || "")) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
    });
  }

  if (file.data.length > MAX_FILE_SIZE) {
    throw createError({
      statusCode: 400,
      statusMessage: "File too large. Maximum size is 5 MB.",
    });
  }

  const key = generateImageKey(file.filename || "image.bin");

  try {
    const url = await uploadImageToR2(
      Buffer.from(file.data),
      key,
      file.type || "application/octet-stream",
    );

    return { url };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to upload image: ${message}`,
    });
  }
});
