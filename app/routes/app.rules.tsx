import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData, useNavigate, useOutletContext } from "@remix-run/react";
import {
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  InlineGrid,
  InlineStack,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import AppLayout from "../components/AppLayout";
import type { AppOutletContext } from "./app";

const FIELDS = [
  { key: "title", label: "Title" },
  { key: "description", label: "Description" },
  { key: "images", label: "Images" },
  { key: "price", label: "Price" },
  { key: "compareAtPrice", label: "Compare-at Price" },
  { key: "inventory", label: "Inventory" },
  { key: "tags", label: "Tags" },
  { key: "vendor", label: "Vendor" },
  { key: "type", label: "Type" },
  { key: "metafields", label: "Metafields" },
  { key: "metaobjects", label: "Metaobjects" },
  { key: "collections", label: "Collections" },
  { key: "seoTitle", label: "SEO Title" },
  { key: "seoDescription", label: "SEO Description" },
] as const;

const DIRECTIONS = [
  { label: "Primary → Secondary", value: "primary_to_secondary" },
  { label: "Secondary → Primary", value: "secondary_to_primary" },
  { label: "Two-way", value: "two_way" },
];

const ROUNDINGS = [
  { label: "No rounding", value: "none" },
  { label: "End in .99", value: "0.99" },
  { label: "End in .95", value: "0.95" },
  { label: "Nearest whole", value: "nearest" },
];

interface FieldRule {
  enabled: boolean;
  direction: string;
}
interface Selective {
  includeTags: string;
  excludeTags: string;
  includeCollections: string;
  includeVendors: string;
}
interface RulesState {
  fields: Record<string, FieldRule>;
  price: { markup: string; fixed: string; rounding: string };
  bufferPercent: string;
  selective: Selective;
}

async function connectionFor(shop: string) {
  return prisma.storeConnection.findFirst({
    where: { status: "connected", OR: [{ primaryShopId: shop }, { secondaryShopId: shop }] },
    orderBy: { connectedAt: "desc" },
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const connection = await connectionFor(session.shop);
  if (!connection) return { connected: false as const, state: null };

  const rules = await prisma.syncRule.findMany({ where: { connectionId: connection.id } });
  const byField = new Map(rules.map((r) => [r.field, r]));

  const fields: Record<string, FieldRule> = {};
  for (const f of FIELDS) {
    const r = byField.get(f.key);
    fields[f.key] = {
      enabled: r?.enabled ?? true,
      direction: r?.direction ?? "primary_to_secondary",
    };
  }
  const priceRule = byField.get("price");
  const inventoryRule = byField.get("inventory");
  const selective = (connection.filterConfig as Selective | null) ?? {
    includeTags: "",
    excludeTags: "",
    includeCollections: "",
    includeVendors: "",
  };

  const state: RulesState = {
    fields,
    price: {
      markup: priceRule?.priceMarkup != null ? String(priceRule.priceMarkup) : "",
      fixed: priceRule?.priceFixed != null ? String(priceRule.priceFixed) : "",
      rounding: priceRule?.rounding ?? "none",
    },
    bufferPercent: inventoryRule?.bufferPercent != null ? String(inventoryRule.bufferPercent) : "",
    selective,
  };

  return { connected: true as const, state };
};

function num(v: string): number | null {
  const n = Number(v);
  return v.trim() === "" || Number.isNaN(n) ? null : n;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const connection = await connectionFor(session.shop);
  if (!connection) return { ok: false as const, error: "No connected store pair." };

  const form = await request.formData();
  const state = JSON.parse(String(form.get("payload") ?? "{}")) as RulesState;

  for (const f of FIELDS) {
    const r = state.fields[f.key];
    const extra: {
      priceMarkup?: number | null;
      priceFixed?: number | null;
      rounding?: string | null;
      bufferPercent?: number | null;
    } = {};
    if (f.key === "price") {
      extra.priceMarkup = num(state.price.markup);
      extra.priceFixed = num(state.price.fixed);
      extra.rounding = state.price.rounding;
    }
    if (f.key === "inventory") {
      const b = num(state.bufferPercent);
      extra.bufferPercent = b == null ? null : Math.round(b);
    }
    await prisma.syncRule.upsert({
      where: { connectionId_field: { connectionId: connection.id, field: f.key } },
      create: { connectionId: connection.id, field: f.key, enabled: r.enabled, direction: r.direction, ...extra },
      update: { enabled: r.enabled, direction: r.direction, ...extra },
    });
  }

  await prisma.storeConnection.update({
    where: { id: connection.id },
    data: { filterConfig: state.selective as object },
  });
  await prisma.activityLog.create({
    data: { shopId: session.shop, action: "Updated sync rules", resourceType: "rule" },
  });

  return { ok: true as const, message: "Sync rules saved." };
};

export default function SyncRules() {
  const data = useLoaderData<typeof loader>();
  const { shop, plan } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const fetcher = useFetcher<typeof action>();

  const [state, setState] = useState<RulesState | null>(data.state);
  const saving = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.ok) shopify.toast.show(fetcher.data.message);
      else shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.state, fetcher.data, shopify]);

  if (!data.connected || !state) {
    return (
      <AppLayout shop={shop} plan={plan}>
        <BlockStack gap="500">
          <Text as="h1" variant="headingXl" fontWeight="bold">
            Sync Rules
          </Text>
          <Card>
            <BlockStack gap="300" inlineAlign="center">
              <Text as="p" tone="subdued">
                Connect a store pair to configure sync rules.
              </Text>
              <Button variant="primary" onClick={() => navigate("/app/connect")}>
                Connect stores
              </Button>
            </BlockStack>
          </Card>
        </BlockStack>
      </AppLayout>
    );
  }

  const setField = (key: string, patch: Partial<FieldRule>) =>
    setState((s) => (s ? { ...s, fields: { ...s.fields, [key]: { ...s.fields[key], ...patch } } } : s));

  const save = () => fetcher.submit({ payload: JSON.stringify(state) }, { method: "post" });

  return (
    <AppLayout shop={shop} plan={plan}>
      <BlockStack gap="500">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text as="h1" variant="headingXl" fontWeight="bold">
              Sync Rules
            </Text>
            <Text as="p" tone="subdued">
              Choose exactly what syncs, in which direction, per field.
            </Text>
          </BlockStack>
          <Button variant="primary" onClick={save} loading={saving}>
            Save rules
          </Button>
        </InlineStack>

        {/* Field-level rules */}
        <Card padding="0">
          <Box padding="400">
            <Text as="h2" variant="headingMd">
              Fields
            </Text>
          </Box>
          <Divider />
          {FIELDS.map((f, i) => (
            <div key={f.key} style={{ background: i % 2 === 0 ? "#FFFFFF" : "#F8F9FF" }}>
              <Box padding="300" paddingInlineStart="400" paddingInlineEnd="400">
                <InlineStack align="space-between" blockAlign="center" wrap={false} gap="400">
                  <Box minWidth="160px">
                    <Checkbox
                      label={f.label}
                      checked={state.fields[f.key].enabled}
                      onChange={(v) => setField(f.key, { enabled: v })}
                    />
                  </Box>
                  <Box minWidth="240px">
                    <Select
                      label="Direction"
                      labelHidden
                      options={DIRECTIONS}
                      value={state.fields[f.key].direction}
                      onChange={(v) => setField(f.key, { direction: v })}
                      disabled={!state.fields[f.key].enabled}
                    />
                  </Box>
                </InlineStack>
              </Box>
            </div>
          ))}
        </Card>

        {/* Price + buffer rules */}
        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Price rules
              </Text>
              <TextField
                label="Markup %"
                type="number"
                autoComplete="off"
                value={state.price.markup}
                onChange={(v) => setState((s) => (s ? { ...s, price: { ...s.price, markup: v } } : s))}
                helpText="Applied to synced prices on the destination store."
              />
              <TextField
                label="Fixed override"
                type="number"
                autoComplete="off"
                value={state.price.fixed}
                onChange={(v) => setState((s) => (s ? { ...s, price: { ...s.price, fixed: v } } : s))}
                helpText="Optional flat price to set on every synced variant."
              />
              <Select
                label="Rounding"
                options={ROUNDINGS}
                value={state.price.rounding}
                onChange={(v) => setState((s) => (s ? { ...s, price: { ...s.price, rounding: v } } : s))}
              />
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Inventory buffer
              </Text>
              <TextField
                label="Buffer %"
                type="number"
                autoComplete="off"
                value={state.bufferPercent}
                onChange={(v) => setState((s) => (s ? { ...s, bufferPercent: v } : s))}
                helpText="Reserve a % of stock on the destination store (e.g. 10 keeps 10% back)."
              />
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* Selective sync */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Selective sync
            </Text>
            <Text as="p" tone="subdued">
              Comma-separated. Leave blank to sync everything.
            </Text>
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
              <TextField label="Include tags" autoComplete="off" value={state.selective.includeTags}
                onChange={(v) => setState((s) => (s ? { ...s, selective: { ...s.selective, includeTags: v } } : s))} />
              <TextField label="Exclude tags" autoComplete="off" value={state.selective.excludeTags}
                onChange={(v) => setState((s) => (s ? { ...s, selective: { ...s.selective, excludeTags: v } } : s))} />
              <TextField label="Include collections" autoComplete="off" value={state.selective.includeCollections}
                onChange={(v) => setState((s) => (s ? { ...s, selective: { ...s.selective, includeCollections: v } } : s))} />
              <TextField label="Include vendors" autoComplete="off" value={state.selective.includeVendors}
                onChange={(v) => setState((s) => (s ? { ...s, selective: { ...s.selective, includeVendors: v } } : s))} />
            </InlineGrid>
          </BlockStack>
        </Card>
      </BlockStack>
    </AppLayout>
  );
}
