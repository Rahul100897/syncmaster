import { Suspense } from "react";
import { defer } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { Await, useLoaderData, useOutletContext, useSearchParams } from "@remix-run/react";
import {
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineStack,
  Pagination,
  Select,
  Text,
} from "@shopify/polaris";
import { format } from "date-fns";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import AppLayout from "../components/AppLayout";
import { SkeletonBlock, SkeletonTable } from "../components/Skeleton";
import type { AppOutletContext } from "./app";

const PAGE_SIZE = 50;

const TYPE_OPTIONS = [
  { label: "All types", value: "" },
  { label: "Connection", value: "connection" },
  { label: "Product", value: "product" },
  { label: "Inventory", value: "inventory" },
  { label: "Snapshot", value: "snapshot" },
  { label: "Rule", value: "rule" },
  { label: "Job", value: "job" },
  { label: "Anomaly", value: "anomaly" },
];

const RANGE_OPTIONS = [
  { label: "All time", value: "all" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
];

function sinceFor(range: string): Date | undefined {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 0;
  return days ? new Date(Date.now() - days * 86400000) : undefined;
}

interface ActivityData {
  type: string;
  range: string;
  hasNext: boolean;
  hasPrev: boolean;
  nextCursor: string | null;
  rows: Array<{
    id: string;
    action: string;
    resourceType: string;
    itemCount: number;
    shopId: string;
    createdAt: string;
  }>;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "";
  const range = url.searchParams.get("range") || "all";
  const cursor = url.searchParams.get("cursor") || null;
  const since = sinceFor(range);

  const data: Promise<ActivityData> = (async () => {
    const where = {
      shopId: session.shop,
      ...(type ? { resourceType: type } : {}),
      ...(since ? { createdAt: { gte: since } } : {}),
    };

    // Fetch one extra row to detect a next page (cursor-based).
    const rows = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasNext = rows.length > PAGE_SIZE;
    const page = rows.slice(0, PAGE_SIZE);

    return {
      type,
      range,
      hasNext,
      hasPrev: Boolean(cursor),
      nextCursor: hasNext ? page[page.length - 1].id : null,
      rows: page.map((r) => ({
        id: r.id,
        action: r.action,
        resourceType: r.resourceType,
        itemCount: r.itemCount,
        shopId: r.shopId,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  })();

  return defer({ data });
};

function ActivitySkeleton() {
  return (
    <BlockStack gap="500">
      <InlineStack align="space-between" blockAlign="center">
        <BlockStack gap="100">
          <SkeletonBlock width={160} height={24} />
          <SkeletonBlock width={360} height={14} />
        </BlockStack>
        <SkeletonBlock width={120} height={40} radius={8} />
      </InlineStack>
      <Card>
        <InlineStack gap="300">
          <SkeletonBlock width={200} height={36} radius={8} />
          <SkeletonBlock width={200} height={36} radius={8} />
        </InlineStack>
      </Card>
      <SkeletonTable rows={8} columns={4} />
    </BlockStack>
  );
}

function ActivityBody({
  data,
  shop,
  plan,
}: {
  data: ActivityData;
  shop: string;
  plan: "free" | "pro";
}) {
  const { type, range, hasNext, hasPrev, nextCursor, rows } = data;
  const [searchParams, setSearchParams] = useSearchParams();

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("cursor"); // reset pagination on filter change
    setSearchParams(next);
  };

  const goNext = () => {
    if (!nextCursor) return;
    const next = new URLSearchParams(searchParams);
    next.set("cursor", nextCursor);
    setSearchParams(next);
  };

  const goFirst = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("cursor");
    setSearchParams(next);
  };

  return (
    <BlockStack gap="500">
      <InlineStack align="space-between" blockAlign="center">
        <BlockStack gap="100">
          <Text as="h1" variant="headingXl" fontWeight="bold">
            Activity Log
          </Text>
          <Text as="p" tone="subdued">
            A full audit trail of everything SyncMaster has done.
          </Text>
        </BlockStack>
        <Button
          url={`/app/activity/export?type=${type}&range=${range}`}
          target="_blank"
          variant="primary"
        >
          Export CSV
        </Button>
      </InlineStack>

      <Card>
        <InlineStack gap="300">
          <Box minWidth="200px">
            <Select
              label="Type"
              labelHidden
              options={TYPE_OPTIONS}
              value={type}
              onChange={(v) => setFilter("type", v)}
            />
          </Box>
          <Box minWidth="200px">
            <Select
              label="Range"
              labelHidden
              options={RANGE_OPTIONS}
              value={range}
              onChange={(v) => setFilter("range", v)}
            />
          </Box>
        </InlineStack>
      </Card>

      <Card padding="0">
        <Box padding="300" paddingInlineStart="400" paddingInlineEnd="400" background="bg-surface-secondary">
          <InlineStack gap="400" wrap={false}>
            <Box minWidth="150px"><Text as="span" variant="bodySm" tone="subdued" fontWeight="medium">Date/Time</Text></Box>
            <Box minWidth="260px"><Text as="span" variant="bodySm" tone="subdued" fontWeight="medium">Action</Text></Box>
            <Box minWidth="100px"><Text as="span" variant="bodySm" tone="subdued" fontWeight="medium">Resource</Text></Box>
            <Box minWidth="60px"><Text as="span" variant="bodySm" tone="subdued" fontWeight="medium">Items</Text></Box>
          </InlineStack>
        </Box>
        <Divider />
        {rows.length === 0 ? (
          <Box padding="600">
            <Text as="p" tone="subdued" alignment="center">
              No activity for these filters.
            </Text>
          </Box>
        ) : (
          <BlockStack>
            {rows.map((r, i) => (
              <div key={r.id} style={{ background: i % 2 === 0 ? "#FFFFFF" : "#F8F9FF" }}>
                <Box padding="300" paddingInlineStart="400" paddingInlineEnd="400">
                  <InlineStack gap="400" blockAlign="center" wrap={false}>
                    <Box minWidth="150px">
                      <Text as="span" variant="bodySm">{format(new Date(r.createdAt), "MMM d, HH:mm")}</Text>
                    </Box>
                    <Box minWidth="260px"><Text as="span" variant="bodyMd">{r.action}</Text></Box>
                    <Box minWidth="100px"><Text as="span" variant="bodySm" tone="subdued">{r.resourceType}</Text></Box>
                    <Box minWidth="60px"><Text as="span" variant="bodySm">{r.itemCount || ""}</Text></Box>
                  </InlineStack>
                </Box>
              </div>
            ))}
          </BlockStack>
        )}
      </Card>

      <InlineStack align="center" gap="300">
        {hasPrev ? (
          <Button variant="plain" onClick={goFirst}>
            ← Back to start
          </Button>
        ) : null}
        <Pagination hasPrevious={false} hasNext={hasNext} onNext={goNext} />
      </InlineStack>
    </BlockStack>
  );
}

export default function ActivityLog() {
  const { data } = useLoaderData<typeof loader>();
  const { shop, plan } = useOutletContext<AppOutletContext>();
  const [searchParams] = useSearchParams();
  return (
    <AppLayout shop={shop} plan={plan}>
      <Suspense key={searchParams.toString()} fallback={<ActivitySkeleton />}>
        <Await resolve={data}>{(resolved) => <ActivityBody data={resolved} shop={shop} plan={plan} />}</Await>
      </Suspense>
    </AppLayout>
  );
}
