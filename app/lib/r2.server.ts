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
