import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { snapshotDownloadUrl, snapshotJson } from "../lib/snapshot.server";

/**
 * Downloads a snapshot's JSON. Serves inline data directly (DB fallback), or
 * redirects to a short-lived signed R2 URL when stored in R2.
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const id = params.id;
  if (!id) throw new Response("Missing snapshot id", { status: 400 });

  const snapshot = await prisma.snapshot.findUnique({ where: { id } });
  if (!snapshot) throw new Response("Snapshot not found", { status: 404 });

  // R2-backed → redirect to the signed URL.
  if (snapshot.fileUrl) {
    return redirect(await snapshotDownloadUrl(id));
  }

  // Inline (DB) → stream the JSON as a file download.
  const json = await snapshotJson(id);
  if (!json) throw new Response("Snapshot has no data", { status: 404 });
  return new Response(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="snapshot-${id}.json"`,
    },
  });
};
