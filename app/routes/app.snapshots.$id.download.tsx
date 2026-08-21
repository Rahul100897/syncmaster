import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { snapshotDownloadUrl } from "../lib/snapshot.server";

/** Redirects to a short-lived signed R2 URL for the snapshot JSON. */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const id = params.id;
  if (!id) throw new Response("Missing snapshot id", { status: 400 });
  const url = await snapshotDownloadUrl(id);
  return redirect(url);
};
