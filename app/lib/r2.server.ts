import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl as presign } from "@aws-sdk/s3-request-presigner";

const accountId = process.env.R2_ACCOUNT_ID ?? "";
const bucket = process.env.R2_BUCKET_NAME ?? "";

/** S3 client pointed at the Cloudflare R2 endpoint for this account. */
export const r2 = new S3Client({
  region: "auto",
  endpoint: accountId
    ? `https://${accountId}.r2.cloudflarestorage.com`
    : undefined,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

/** Upload a body to R2 under `key`. Returns the object key. */
export async function upload(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<string> {
  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return key;
}

/** Generate a time-limited signed download URL for an R2 object. */
export async function getSignedUrl(
  key: string,
  expiresInSeconds = 3600,
): Promise<string> {
  return presign(r2, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: expiresInSeconds,
  });
}

/** Download an R2 object's contents as a UTF-8 string. */
export async function download(key: string): Promise<string> {
  const res = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!res.Body) throw new Error(`R2 object ${key} has no body`);
  // AWS SDK v3 Body is a stream with transformToString() in Node.
  const body = res.Body as { transformToString: () => Promise<string> };
  return body.transformToString();
}

/** Whether R2 credentials are configured (else uploads/downloads will fail). */
export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME,
  );
}
