import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useOutletContext, useNavigate } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineGrid,
  InlineStack,
  Text,
} from "@shopify/polaris";
import { formatDistanceToNow } from "date-fns";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import AppLayout from "../components/AppLayout";
import type { AppOutletContext } from "./app";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Connections where this shop participates (as primary or secondary).
  const connections = await prisma.storeConnection.findMany({
    where: {
      OR: [{ primaryShopId: shop }, { secondaryShopId: shop }],
    },
    select: { id: true, status: true },
  });
  const connectionIds = connections.map((c) => c.id);
  const connectedStores = connections.filter(
    (c) => c.status === "connected",
  ).length;

  const [productsAgg, jobsToday, lastSnapshot, recentActivityRaw] =
    await Promise.all([
      prisma.syncJob.aggregate({
        _sum: { successItems: true },
        where: { connectionId: { in: connectionIds } },
      }),
      prisma.syncJob.count({
        where: {
          connectionId: { in: connectionIds },
          startedAt: { gte: startOfToday() },
        },
      }),
      prisma.snapshot.findFirst({
        where: { connectionId: { in: connectionIds } },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.activityLog.findMany({
        where: { shopId: shop },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

  return {
    metrics: {
      connectedStores,
      productsSynced: productsAgg._sum.successItems ?? 0,
      jobsToday,
      lastSnapshotAt: lastSnapshot?.createdAt.toISOString() ?? null,
    },
    recentActivity: recentActivityRaw.map((a) => ({
      id: a.id,
      action: a.action,
      resourceType: a.resourceType,
      itemCount: a.itemCount,
      createdAt: a.createdAt.toISOString(),
    })),
  };
};

interface MetricCardProps {
  label: string;
  value: string;
  accent: string;
  icon: JSX.Element;
}

function MetricCard({ label, value, accent, icon }: MetricCardProps) {
  return (
    <Box
      background="bg-surface"
      borderRadius="300"
      borderWidth="025"
      borderColor="border"
      shadow="100"
      // colored top border per design rules
      // (Polaris Box has no top-only border token, so use inline style)
      // eslint-disable-next-line react/forbid-dom-props
    >
      <div style={{ borderTop: `3px solid ${accent}`, borderRadius: "12px 12px 0 0" }}>
        <Box padding="400">
          <InlineStack align="space-between" blockAlign="start" wrap={false}>
            <BlockStack gap="200">
              <Text as="span" variant="bodySm" tone="subdued">
                {label}
              </Text>
              <Text as="p" variant="heading2xl" fontWeight="bold">
                {value}
              </Text>
            </BlockStack>
            <span style={{ color: accent, display: "flex" }}>{icon}</span>
          </InlineStack>
        </Box>
      </div>
    </Box>
  );
}

function Icon({ path }: { path: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

function EmptyActivity({ onConnect }: { onConnect: () => void }) {
  return (
    <Box padding="800">
      <BlockStack gap="400" inlineAlign="center">
        <svg width="120" height="90" viewBox="0 0 120 90" fill="none" aria-hidden="true">
          <rect x="8" y="16" width="104" height="58" rx="8" fill="#EEF2FF" />
          <rect x="20" y="30" width="46" height="8" rx="4" fill="#C7D2FE" />
          <rect x="20" y="46" width="70" height="6" rx="3" fill="#DBE1FF" />
          <rect x="20" y="58" width="54" height="6" rx="3" fill="#DBE1FF" />
          <circle cx="94" cy="30" r="10" fill="#6366F1" />
          <path
            d="M90 30l3 3 6-6"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <BlockStack gap="100" inlineAlign="center">
          <Text as="h3" variant="headingMd">
            No activity yet
          </Text>
          <Text as="p" tone="subdued" alignment="center">
            Connect a second store to start syncing products and inventory.
            Everything you do will show up here.
          </Text>
        </BlockStack>
        <Button variant="primary" onClick={onConnect}>
          Connect a store
        </Button>
      </BlockStack>
    </Box>
  );
}

export default function Dashboard() {
  const { metrics, recentActivity } = useLoaderData<typeof loader>();
  const { plan, shop } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();
  const isPro = plan === "pro";

  const lastSnapshotLabel = metrics.lastSnapshotAt
    ? formatDistanceToNow(new Date(metrics.lastSnapshotAt), { addSuffix: true })
    : "None yet";

  return (
    <AppLayout shop={shop} plan={plan}>
      <BlockStack gap="500">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h1" variant="headingXl" fontWeight="bold">
            Dashboard
          </Text>
          <Button variant="primary" onClick={() => navigate("/app/connect")}>
            Connect Stores
          </Button>
        </InlineStack>

        <InlineGrid columns={{ xs: 1, sm: 2, lg: 4 }} gap="400">
          <MetricCard
            label="Connected Stores"
            value={String(metrics.connectedStores)}
            accent="#6366F1"
            icon={<Icon path="M4 4h16v16H4zM8 7h8M8 12h8M8 17h5" />}
          />
          <MetricCard
            label="Products Synced"
            value={metrics.productsSynced.toLocaleString()}
            accent="#22C55E"
            icon={<Icon path="M20 7l-8-4-8 4 8 4 8-4zM4 7v10l8 4 8-4V7" />}
          />
          <MetricCard
            label="Jobs Today"
            value={String(metrics.jobsToday)}
            accent="#F59E0B"
            icon={<Icon path="M22 11.5A10 10 0 1 1 12 2M22 4l-10 10-3-3" />}
          />
          <MetricCard
            label="Last Snapshot"
            value={lastSnapshotLabel}
            accent="#0EA5E9"
            icon={<Icon path="M12 15V3M7 10l5 5 5-5M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" />}
          />
        </InlineGrid>

        <InlineGrid columns={{ xs: 1, lg: "2fr 1fr" }} gap="400">
          {/* Recent activity */}
          <Card padding="0">
            <Box padding="400">
              <Text as="h2" variant="headingMd">
                Recent Activity
              </Text>
            </Box>
            <Divider />
            {recentActivity.length === 0 ? (
              <EmptyActivity onConnect={() => navigate("/app/connect")} />
            ) : (
              <BlockStack>
                {recentActivity.map((a, i) => (
                  <div
                    key={a.id}
                    style={{ background: i % 2 === 0 ? "#FFFFFF" : "#F8F9FF" }}
                  >
                    <Box padding="300" paddingInlineStart="400" paddingInlineEnd="400">
                      <InlineStack align="space-between" blockAlign="center" wrap={false}>
                        <BlockStack gap="050">
                          <Text as="span" variant="bodyMd" fontWeight="medium">
                            {a.action}
                          </Text>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {a.resourceType}
                            {a.itemCount ? ` · ${a.itemCount} items` : ""}
                          </Text>
                        </BlockStack>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {formatDistanceToNow(new Date(a.createdAt), {
                            addSuffix: true,
                          })}
                        </Text>
                      </InlineStack>
                    </Box>
                  </div>
                ))}
              </BlockStack>
            )}
          </Card>

          {/* Right rail: Quick Actions + Your Plan */}
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Quick Actions
                </Text>
                <Button fullWidth onClick={() => navigate("/app/connect")}>
                  Connect a store
                </Button>
                <Button fullWidth onClick={() => navigate("/app/rules")}>
                  Configure sync rules
                </Button>
                <Button fullWidth onClick={() => navigate("/app/snapshots")}>
                  Create snapshot
                </Button>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Your Plan
                  </Text>
                  <Badge tone={isPro ? "success" : undefined}>
                    {isPro ? "PRO" : "FREE"}
                  </Badge>
                </InlineStack>
                {isPro ? (
                  <Text as="p" tone="subdued">
                    You have full access to real-time sync, snapshots, analytics,
                    and every SyncMaster feature.
                  </Text>
                ) : (
                  <>
                    <Text as="p" tone="subdued">
                      Free covers 2 stores and 25 products in migration mode.
                      Upgrade to Pro for real-time sync, unlimited products,
                      snapshots, and rollback.
                    </Text>
                    <Button
                      variant="primary"
                      fullWidth
                      onClick={() => navigate("/app/billing")}
                    >
                      Upgrade to Pro — $29/mo
                    </Button>
                  </>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </InlineGrid>
      </BlockStack>
    </AppLayout>
  );
}
