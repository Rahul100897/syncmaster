import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getPayouts, payoutsToCsv } from "../lib/payouts.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days")) || 30;
  const report = await getPayouts(session.shop, days);
  return new Response(payoutsToCsv(report), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="syncmaster-payouts-${days}d.csv"`,
    },
  });
};
