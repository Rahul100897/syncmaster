import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

function sinceFor(range: string): Date | undefined {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 0;
  return days ? new Date(Date.now() - days * 86400000) : undefined;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "";
  const range = url.searchParams.get("range") || "all";
  const since = sinceFor(range);

  const rows = await prisma.activityLog.findMany({
    where: {
      shopId: session.shop,
      ...(type ? { resourceType: type } : {}),
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const lines = ["Date,Action,Resource,Items,Store"];
  for (const r of rows) {
    lines.push(
      `${r.createdAt.toISOString()},${JSON.stringify(r.action)},${r.resourceType},${r.itemCount},${r.shopId}`,
    );
  }
  return new Response(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="syncmaster-activity.csv"`,
    },
  });
};
