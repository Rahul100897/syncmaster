import { Suspense, useEffect, useState } from "react";
import { defer } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  Await,
  useAsyncValue,
  useFetcher,
  useLoaderData,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "@remix-run/react";
import {
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Card,
  Divider,
  InlineGrid,
  InlineStack,
  SkeletonBodyText,
  Text,
  TextField,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { formatDistanceToNow } from "date-fns";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getPayouts, type PayoutReport } from "../lib/payouts.server";
import AppLayout from "../components/AppLayout";
import type { AppOutletContext } from "./app";

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days")) || 30;
  return defer({ days, report: getPayouts(session.shop, days) });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const pct = Math.max(0, Math.min(100, Math.round(Number(form.get("primaryPct")) || 0)));
  const connection = await prisma.storeConnection.findFirst({
    where: { status: "connected", OR: [{ primaryShopId: session.shop }, { secondaryShopId: session.shop }] },
    orderBy: { connectedAt: "desc" },
  });
  if (!connection) return { ok: false as const, error: "No connected store pair." };
  await prisma.storeConnection.update({ where: { id: connection.id }, data: { payoutPrimaryPct: pct } });
  return { ok: true as const, message: `Split saved — primary ${pct}% / secondary ${100 - pct}%.` };
};

function money(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function PayoutBody() {
  const r = useAsyncValue() as PayoutReport;

  if (!r.connected) {
    return (
      <Card>
        <Text as="p" tone="subdued">
          Connect a store pair to see payout splits.
        </Text>
      </Card>
    );
  }

  return (
    <BlockStack gap="400">
      <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
        <Card>
          <BlockStack gap="100">
            <Text as="span" variant="bodySm" tone="subdued">Total revenue</Text>
            <Text as="p" variant="heading2xl" fontWeight="bold">{money(r.totals.total)}</Text>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="100">
            <Text as="span" variant="bodySm" tone="subdued">{r.primaryShop} ({r.primaryPct}%)</Text>
            <Text as="p" variant="heading2xl" fontWeight="bold">{money(r.totals.primary)}</Text>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="100">
            <Text as="span" variant="bodySm" tone="subdued">{r.secondaryShop} ({100 - r.primaryPct}%)</Text>
            <Text as="p" variant="heading2xl" fontWeight="bold">{money(r.totals.secondary)}</Text>
          </BlockStack>
        </Card>
      </InlineGrid>

      {r.truncated ? (
        <Text as="p" tone="subdued" variant="bodySm">
          Note: order volume exceeded the fetch limit — showing the most recent orders.
        </Text>
      ) : null}

      <Card padding="0">
        <Box padding="400"><Text as="h2" variant="headingMd">Orders</Text></Box>
        <Divider />
        {r.rows.length === 0 ? (
          <Box padding="400"><Text as="p" tone="subdued">No orders in this period.</Text></Box>
        ) : (
          <BlockStack>
            {r.rows.slice(0, 100).map((row, i) => (
              <div key={`${row.orderId}-${i}`} style={{ background: i % 2 === 0 ? "#FFFFFF" : "#F8F9FF" }}>
                <Box padding="300" paddingInlineStart="400" paddingInlineEnd="400">
                  <InlineStack align="space-between" blockAlign="center" wrap={false} gap="300">
                    <BlockStack gap="050">
                      <Text as="span" variant="bodyMd" fontWeight="medium">#{row.orderId}</Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {row.soldBy} · {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
                      </Text>
                    </BlockStack>
                    <InlineStack gap="400" blockAlign="center">
                      <Text as="span" variant="bodySm" tone="subdued">P {money(row.primaryShare)}</Text>
                      <Text as="span" variant="bodySm" tone="subdued">S {money(row.secondaryShare)}</Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">{money(row.total)}</Text>
                    </InlineStack>
                  </InlineStack>
                </Box>
              </div>
            ))}
          </BlockStack>
        )}
      </Card>
    </BlockStack>
  );
}

export default function Payouts() {
  const { days, report } = useLoaderData<typeof loader>();
  const { shop, plan } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const [, setSearchParams] = useSearchParams();
  const splitFetcher = useFetcher<typeof action>();
  const [pct, setPct] = useState("50");

  useEffect(() => {
    if (splitFetcher.state === "idle" && splitFetcher.data) {
      if (splitFetcher.data.ok) shopify.toast.show(splitFetcher.data.message);
      else shopify.toast.show(splitFetcher.data.error, { isError: true });
    }
  }, [splitFetcher.state, splitFetcher.data, shopify]);

  return (
    <AppLayout shop={shop} plan={plan}>
      <BlockStack gap="500">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text as="h1" variant="headingXl" fontWeight="bold">Payout splits</Text>
            <Text as="p" tone="subdued">Revenue sharing across connected stores.</Text>
          </BlockStack>
          <InlineStack gap="300" blockAlign="center">
            <ButtonGroup variant="segmented">
              {RANGES.map((rg) => (
                <Button key={rg.days} pressed={days === rg.days} onClick={() => setSearchParams({ days: String(rg.days) })}>
                  {rg.label}
                </Button>
              ))}
            </ButtonGroup>
            <Button url={`/app/payouts/export?days=${days}`} target="_blank" variant="primary">
              Export CSV
            </Button>
          </InlineStack>
        </InlineStack>

        <Card>
          <InlineStack gap="300" blockAlign="end">
            <Box minWidth="200px">
              <TextField
                label="Primary store share (%)"
                type="number"
                autoComplete="off"
                value={pct}
                onChange={setPct}
                min={0}
                max={100}
              />
            </Box>
            <Button
              onClick={() => splitFetcher.submit({ primaryPct: pct }, { method: "post" })}
              loading={splitFetcher.state !== "idle"}
            >
              Save split
            </Button>
          </InlineStack>
        </Card>

        <Suspense fallback={<Card><SkeletonBodyText lines={6} /></Card>} key={days}>
          <Await resolve={report}>
            <PayoutBody />
          </Await>
        </Suspense>
      </BlockStack>
    </AppLayout>
  );
}
