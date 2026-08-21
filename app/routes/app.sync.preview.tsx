import { Suspense, useState } from "react";
import { defer, redirect } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  Await,
  useAsyncValue,
  useLoaderData,
  useNavigate,
  useOutletContext,
  useRevalidator,
  Form,
  useNavigation,
} from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Banner,
  Box,
  Button,
  Card,
  Collapsible,
  DataTable,
  InlineGrid,
  InlineStack,
  SkeletonBodyText,
  SkeletonDisplayText,
  Text,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { dryRun, type DryRunResult, type Classification } from "../lib/sync.server";
import { scanConflicts, type ConflictReport } from "../lib/conflict.server";
import { syncQueue } from "../lib/queue.server";
import AppLayout from "../components/AppLayout";
import type { AppOutletContext } from "./app";

interface PreviewData {
  dry: DryRunResult;
  conflicts: ConflictReport;
}

async function findConnectionFor(shop: string) {
  return prisma.storeConnection.findFirst({
    where: {
      status: "connected",
      OR: [{ primaryShopId: shop }, { secondaryShopId: shop }],
    },
    orderBy: { connectedAt: "desc" },
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const connection = await findConnectionFor(session.shop);

  if (!connection || !connection.secondaryShopId) {
    return defer({ connected: false as const, preview: null, connectionId: null });
  }

  // Heavy cross-store fetches run in parallel and are streamed to the UI
  // behind a skeleton (design rule 5). Read-only — nothing is written.
  const preview: Promise<PreviewData> = Promise.all([
    dryRun(connection.id),
    scanConflicts(connection.primaryShopId, connection.secondaryShopId),
  ]).then(([dry, conflicts]) => ({ dry, conflicts }));

  return defer({
    connected: true as const,
    connectionId: connection.id,
    preview,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const connection = await findConnectionFor(session.shop);
  if (!connection || !connection.secondaryShopId) {
    throw new Error("No fully connected store pair to sync.");
  }

  // Create the job row, then enqueue it for the worker. The worker takes a
  // snapshot before writing (CLAUDE.md: always snapshot before bulk sync).
  const job = await prisma.syncJob.create({
    data: {
      connectionId: connection.id,
      type: "migration",
      status: "pending",
      triggeredBy: "manual",
    },
  });
  await syncQueue.add("migration", { jobId: job.id, connectionId: connection.id });
  await prisma.activityLog.create({
    data: {
      shopId: session.shop,
      action: "Started migration sync",
      resourceType: "job",
    },
  });

  return redirect("/app/jobs");
};

const CLASS_LABELS: Record<Classification, { label: string; tone: "success" | "info" | "subdued" | "critical" }> = {
  will_create: { label: "Will create", tone: "success" },
  will_update: { label: "Will update", tone: "info" },
  will_skip: { label: "Will skip", tone: "subdued" },
  conflict: { label: "Conflict", tone: "critical" },
};

function CategorySection({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: "success" | "info" | "subdued" | "critical";
  rows: string[][];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card padding="0">
      <Box padding="400">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Badge tone={tone === "subdued" ? undefined : tone}>{String(rows.length)}</Badge>
            <Text as="h3" variant="headingMd">
              {title}
            </Text>
          </InlineStack>
          <Button
            variant="plain"
            disabled={rows.length === 0}
            onClick={() => setOpen((v) => !v)}
            ariaExpanded={open}
            ariaControls={`sect-${title}`}
          >
            {open ? "Hide" : "Show"}
          </Button>
        </InlineStack>
      </Box>
      <Collapsible open={open} id={`sect-${title}`}>
        <Box paddingBlockEnd="200">
          <DataTable
            columnContentTypes={["text", "text"]}
            headings={["Product", "Detail"]}
            rows={rows}
            truncate
          />
        </Box>
      </Collapsible>
    </Card>
  );
}

function PreviewBody() {
  const { dry, conflicts } = useAsyncValue() as PreviewData;
  const navigation = useNavigation();
  const navigate = useNavigate();
  const submitting = navigation.state !== "idle";

  const rowsFor = (cls: Classification) =>
    dry.items
      .filter((i) => i.classification === cls)
      .map((i) => [i.title || i.resourceId, i.reason ?? ""]);

  const warnings = [...dry.warnings, ...conflicts.warnings];

  return (
    <BlockStack gap="400">
      {/* Summary */}
      <InlineGrid columns={{ xs: 2, sm: 4 }} gap="300">
        {(["will_create", "will_update", "will_skip", "conflict"] as Classification[]).map(
          (cls) => {
            const count =
              cls === "will_create"
                ? dry.willCreate
                : cls === "will_update"
                  ? dry.willUpdate
                  : cls === "will_skip"
                    ? dry.willSkip
                    : dry.conflicts;
            return (
              <Card key={cls}>
                <BlockStack gap="100">
                  <Text as="span" variant="bodySm" tone="subdued">
                    {CLASS_LABELS[cls].label}
                  </Text>
                  <Text as="p" variant="heading2xl" fontWeight="bold">
                    {String(count)}
                  </Text>
                </BlockStack>
              </Card>
            );
          },
        )}
      </InlineGrid>

      {warnings.length > 0 ? (
        <Banner tone="warning" title="Heads up">
          <BlockStack gap="100">
            {warnings.map((w, i) => (
              <Text as="p" key={i}>
                {w}
              </Text>
            ))}
          </BlockStack>
        </Banner>
      ) : null}

      {/* Conflicts section (from the scanner — richer than structure-only) */}
      {conflicts.conflicts.length > 0 ? (
        <Card padding="0">
          <Box padding="400">
            <InlineStack gap="200" blockAlign="center">
              <Badge tone="critical">{String(conflicts.conflicts.length)}</Badge>
              <Text as="h3" variant="headingMd">
                Conflicts — resolve before syncing
              </Text>
            </InlineStack>
          </Box>
          <Box paddingBlockEnd="200">
            <DataTable
              columnContentTypes={["text", "text", "text"]}
              headings={["Resource", "Type", "Why"]}
              rows={conflicts.conflicts.map((c) => [c.resourceId, c.kind, c.detail])}
              truncate
            />
          </Box>
        </Card>
      ) : null}

      <CategorySection title="Will create" tone="success" rows={rowsFor("will_create")} />
      <CategorySection title="Will update" tone="info" rows={rowsFor("will_update")} />
      <CategorySection title="Will skip" tone="subdued" rows={rowsFor("will_skip")} />

      {/* Actions */}
      <Card>
        <InlineStack align="space-between" blockAlign="center">
          <Text as="p" tone="subdued">
            {conflicts.conflicts.length > 0
              ? "Resolve conflicts first — syncing may overwrite mismatched data."
              : "A snapshot is taken automatically before any changes are written."}
          </Text>
          <InlineStack gap="200">
            <Button onClick={() => navigate("/app")}>Cancel</Button>
            <Form method="post">
              <Button variant="primary" submit loading={submitting}>
                Proceed with sync
              </Button>
            </Form>
          </InlineStack>
        </InlineStack>
      </Card>
    </BlockStack>
  );
}

function PreviewSkeleton() {
  return (
    <BlockStack gap="400">
      <InlineGrid columns={{ xs: 2, sm: 4 }} gap="300">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <BlockStack gap="200">
              <SkeletonDisplayText size="small" />
              <SkeletonBodyText lines={1} />
            </BlockStack>
          </Card>
        ))}
      </InlineGrid>
      <Card>
        <SkeletonBodyText lines={4} />
      </Card>
    </BlockStack>
  );
}

export default function SyncPreview() {
  const data = useLoaderData<typeof loader>();
  const { shop, plan } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  return (
    <AppLayout shop={shop} plan={plan}>
      <BlockStack gap="500">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text as="h1" variant="headingXl" fontWeight="bold">
              Safe Sync preview
            </Text>
            <Text as="p" tone="subdued">
              A read-only dry run. Nothing is written until you choose to proceed.
            </Text>
          </BlockStack>
          <Button onClick={() => revalidator.revalidate()} loading={revalidator.state !== "idle"}>
            Re-scan
          </Button>
        </InlineStack>

        {!data.connected ? (
          <Card>
            <BlockStack gap="300" inlineAlign="center">
              <Text as="h2" variant="headingMd">
                No connected store pair
              </Text>
              <Text as="p" tone="subdued" alignment="center">
                Connect a primary and secondary store before running a sync preview.
              </Text>
              <Button variant="primary" onClick={() => navigate("/app/connect")}>
                Connect stores
              </Button>
            </BlockStack>
          </Card>
        ) : (
          <Suspense fallback={<PreviewSkeleton />}>
            <Await resolve={data.preview}>
              <PreviewBody />
            </Await>
          </Suspense>
        )}
      </BlockStack>
    </AppLayout>
  );
}
