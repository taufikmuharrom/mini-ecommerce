import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

let _r2Client: S3Client | null = null;

export function getR2Client(): S3Client {
  if (_r2Client) return _r2Client;

  const config = useRuntimeConfig();

  const accountId = config.r2AccountId;
  const accessKeyId = config.r2AccessKeyId;
  const secretAccessKey = config.r2SecretAccessKey;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw createError({
      statusCode: 500,
      statusMessage: "R2 credentials are not configured",
    });
  }

  _r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return _r2Client;
}

export function generateImageKey(originalName: string): string {
  const ext = originalName.split(".").pop() || "bin";
  const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "bin";
  const id = crypto.randomUUID();
  const timestamp = Date.now();
  return `products/${timestamp}-${id}.${safeExt}`;
}

export async function uploadImageToR2(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> {
  const config = useRuntimeConfig();
  const bucketName = config.r2BucketName;
  const publicUrl = config.r2PublicUrl;

  if (!bucketName) {
    throw createError({
      statusCode: 500,
      statusMessage: "R2 bucket name is not configured",
    });
  }

  const client = getR2Client();

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ACL: "public-read",
  });

  await client.send(command);

  if (publicUrl) {
    const base = publicUrl.endsWith("/") ? publicUrl.slice(0, -1) : publicUrl;
    return `${base}/${key}`;
  }

  return `https://${bucketName}.r2.dev/${key}`;
}
