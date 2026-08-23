import { useEffect, useState } from "react";
import crypto from "node:crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  useFetcher,
  useLoaderData,
  useOutletContext,
  useRevalidator,
} from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Text,
  TextField,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { isPro } from "../lib/billing.server";
import AppLayout from "../components/AppLayout";
import { SkeletonBlock, useRouteLoading } from "../components/Skeleton";
import type { AppOutletContext } from "./app";

const FREE_MAX_STORES = 2; // primary + 1 secondary
const PRO_MAX_STORES = 5; // primary + 4 secondaries

type ConnectionDTO = {
  id: string;
  primaryShopId: string;
  secondaryShopId: string | null;
  linkCode: string;
  status: string;
  plan: string;
  connectedAt: string | null;
};

function toDTO(c: {
  id: string;
  primaryShopId: string;
  secondaryShopId: string | null;
  linkCode: string;
  status: string;
  plan: string;
  connectedAt: Date | null;
}): ConnectionDTO {
  return { ...c, connectedAt: c.connectedAt?.toISOString() ?? null };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [asPrimary, asSecondary] = await Promise.all([
    prisma.storeConnection.findFirst({
      where: { primaryShopId: shop, status: { in: ["pending", "connected"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.storeConnection.findFirst({
      where: { secondaryShopId: shop, status: "connected" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    shop,
    asPrimary: asPrimary ? toDTO(asPrimary) : null,
    asSecondary: asSecondary ? toDTO(asSecondary) : null,
  };
};

async function generateUniqueCode(): Promise<string> {
  // 6-digit numeric code, retry on the (rare) unique-constraint collision.
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
    const existing = await prisma.storeConnection.findUnique({
      where: { linkCode: code },
    });
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique link code, please try again.");
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "generate") {
    // Reuse an existing pending code rather than piling up rows.
    const pending = await prisma.storeConnection.findFirst({
      where: { primaryShopId: shop, status: "pending" },
      orderBy: { createdAt: "desc" },
    });
    if (pending) {
      return { ok: true as const, intent, code: pending.linkCode };
    }

    // Enforce plan store limits (primary counts as one store).
    const pro = await isPro(shop);
    const max = pro ? PRO_MAX_STORES : FREE_MAX_STORES;
    const connectedCount = await prisma.storeConnection.count({
      where: { primaryShopId: shop, status: "connected" },
    });
    if (connectedCount + 1 >= max) {
      return {
        ok: false as const,
        intent,
        error: `Your ${pro ? "Pro" : "Free"} plan allows up to ${max} stores. ${
          pro ? "" : "Upgrade to Pro to connect more."
        }`.trim(),
      };
    }

    const code = await generateUniqueCode();
    await prisma.storeConnection.create({
      data: {
        primaryShopId: shop,
        linkCode: code,
        status: "pending",
        plan: pro ? "pro" : "free",
      },
    });
    await prisma.activityLog.create({
      data: {
        shopId: shop,
        action: "Generated link code",
        resourceType: "connection",
      },
    });
    return { ok: true as const, intent, code };
  }

  if (intent === "connect") {
    const code = String(form.get("code") ?? "").trim();
    if (!/^\d{6}$/.test(code)) {
      return { ok: false as const, intent, error: "Enter a valid 6-digit code." };
    }

    const connection = await prisma.storeConnection.findUnique({
      where: { linkCode: code },
    });
    if (!connection) {
      return { ok: false as const, intent, error: "No connection found for that code." };
    }
    if (connection.status !== "pending") {
      return { ok: false as const, intent, error: "That code has already been used." };
    }
    if (connection.primaryShopId === shop) {
      return {
        ok: false as const,
        intent,
        error: "You can't connect a store to itself. Enter the code on the other store.",
      };
    }

    const updated = await prisma.storeConnection.update({
      where: { id: connection.id },
      data: {
        secondaryShopId: shop,
        status: "connected",
        connectedAt: new Date(),
      },
    });
    await prisma.activityLog.createMany({
      data: [
        {
          shopId: updated.primaryShopId,
          action: `Connected to ${shop}`,
          resourceType: "connection",
        },
        {
          shopId: shop,
          action: `Connected to ${updated.primaryShopId}`,
          resourceType: "connection",
        },
      ],
    });
    return { ok: true as const, intent, connectedTo: updated.primaryShopId };
  }

  return { ok: false as const, intent, error: "Unknown action." };
};

export default function ConnectStores() {
  const { shop, asPrimary, asSecondary } = useLoaderData<typeof loader>();
  const { plan } = useOutletContext<AppOutletContext>();
  const generateFetcher = useFetcher<typeof action>();
  const connectFetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const [code, setCode] = useState("");
  const routeLoading = useRouteLoading();

  if (routeLoading) {
    return (
      <AppLayout shop={shop} plan={plan}>
        <BlockStack gap="500">
          <BlockStack gap="100">
            <SkeletonBlock width={200} height={24} />
            <SkeletonBlock width={360} height={14} />
          </BlockStack>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            <Card>
              <BlockStack gap="400">
                <SkeletonBlock width={180} height={16} />
                <SkeletonBlock width={280} height={12} />
                <SkeletonBlock height={72} radius={12} />
                <SkeletonBlock width={150} height={40} radius={8} />
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="400">
                <SkeletonBlock width={180} height={16} />
                <SkeletonBlock width={280} height={12} />
                <SkeletonBlock height={40} radius={8} />
                <SkeletonBlock width={120} height={40} radius={8} />
              </BlockStack>
            </Card>
          </InlineGrid>
        </BlockStack>
      </AppLayout>
    );
  }

  const generating = generateFetcher.state !== "idle";
  const connecting = connectFetcher.state !== "idle";

  // The freshly-generated code (from the action) or the persisted pending one.
  const displayCode =
    generateFetcher.data?.ok && "code" in generateFetcher.data
      ? generateFetcher.data.code
      : asPrimary?.status === "pending"
        ? asPrimary.linkCode
        : null;

  const primaryConnected = asPrimary?.status === "connected";
  const waitingForSecondary = Boolean(displayCode) && !primaryConnected;

  // Auto-refresh every 5s while waiting for the secondary store to connect.
  useEffect(() => {
    if (!waitingForSecondary) return;
    const id = setInterval(() => {
      if (revalidator.state === "idle") revalidator.revalidate();
    }, 5000);
    return () => clearInterval(id);
  }, [waitingForSecondary, revalidator]);

  const generateError =
    generateFetcher.data && !generateFetcher.data.ok
      ? generateFetcher.data.error
      : null;
  const connectError =
    connectFetcher.data && !connectFetcher.data.ok ? connectFetcher.data.error : null;

  return (
    <AppLayout shop={shop} plan={plan}>
      <BlockStack gap="500">
        <BlockStack gap="100">
          <Text as="h1" variant="headingXl" fontWeight="bold">
            Connect Stores
          </Text>
          <Text as="p" tone="subdued">
            Link this store with another Shopify store to sync products and
            inventory. Connect in under 60 seconds.
          </Text>
        </BlockStack>

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          {/* Panel 1 — Generate (primary store) */}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Generate a link code
                </Text>
                {primaryConnected ? <Badge tone="success">Connected</Badge> : null}
              </InlineStack>

              {primaryConnected ? (
                <Box background="bg-surface-success" borderRadius="300" padding="500">
                  <BlockStack gap="100" inlineAlign="center">
                    <Text as="p" variant="headingMd" fontWeight="semibold">
                      ✓ Connected
                    </Text>
                    <Text as="p" tone="subdued">
                      Syncing with {asPrimary?.secondaryShopId}
                    </Text>
                  </BlockStack>
                </Box>
              ) : (
                <>
                  <Text as="p" tone="subdued">
                    Use this store as the primary (billing) store. Share the code
                    with the store you want to connect.
                  </Text>

                  <Box background="bg-surface-secondary" borderRadius="300" padding="500">
                    <InlineStack align="center">
                      <Text
                        as="p"
                        variant="heading2xl"
                        fontWeight="bold"
                        tone={displayCode ? undefined : "subdued"}
                      >
                        {displayCode
                          ? displayCode.split("").join(" ")
                          : "– – – – – –"}
                      </Text>
                    </InlineStack>
                  </Box>

                  {waitingForSecondary ? (
                    <InlineStack gap="200" blockAlign="center" align="center">
                      <Badge tone="attention">Waiting for the other store…</Badge>
                    </InlineStack>
                  ) : null}

                  {generateError ? (
                    <Text as="p" tone="critical">
                      {generateError}
                    </Text>
                  ) : null}

                  <generateFetcher.Form method="post">
                    <input type="hidden" name="intent" value="generate" />
                    <Button
                      variant="primary"
                      size="large"
                      submit
                      loading={generating}
                      disabled={waitingForSecondary}
                    >
                      {displayCode ? "Regenerate Code" : "Generate Code"}
                    </Button>
                  </generateFetcher.Form>
                </>
              )}
            </BlockStack>
          </Card>

          {/* Panel 2 — Enter (secondary store) */}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Enter a link code
                </Text>
                {asSecondary ? <Badge tone="success">Connected</Badge> : null}
              </InlineStack>

              {asSecondary ? (
                <Box background="bg-surface-success" borderRadius="300" padding="500">
                  <BlockStack gap="100" inlineAlign="center">
                    <Text as="p" variant="headingMd" fontWeight="semibold">
                      ✓ Connected
                    </Text>
                    <Text as="p" tone="subdued">
                      Primary store: {asSecondary.primaryShopId}
                    </Text>
                  </BlockStack>
                </Box>
              ) : (
                <>
                  <Text as="p" tone="subdued">
                    Use this store as a secondary store. Enter the 6-digit code
                    generated by the primary store.
                  </Text>

                  <connectFetcher.Form method="post">
                    <input type="hidden" name="intent" value="connect" />
                    <BlockStack gap="300">
                      <TextField
                        label="Link code"
                        labelHidden
                        name="code"
                        value={code}
                        onChange={setCode}
                        autoComplete="off"
                        maxLength={6}
                        placeholder="Enter 6-digit code"
                        inputMode="numeric"
                        error={connectError ?? undefined}
                      />
                      <Button
                        size="large"
                        submit
                        loading={connecting}
                        disabled={code.length !== 6}
                      >
                        Connect
                      </Button>
                    </BlockStack>
                  </connectFetcher.Form>
                </>
              )}
            </BlockStack>
          </Card>
        </InlineGrid>
      </BlockStack>
    </AppLayout>
  );
}
