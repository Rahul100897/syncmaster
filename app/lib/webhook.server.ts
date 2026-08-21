import crypto from "node:crypto";

/**
 * Verify the HMAC-SHA256 signature on an incoming Shopify webhook request.
 * Always call this before processing a webhook body (see CLAUDE.md).
 *
 * Note: this reads the request body, so pass a clone if the body is needed
 * again downstream.
 */
export async function verifyWebhook(request: Request): Promise<boolean> {
  const hmacHeader = request.headers.get("X-Shopify-Hmac-Sha256");
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!hmacHeader || !secret) return false;

  const rawBody = Buffer.from(await request.arrayBuffer());
  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");

  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
