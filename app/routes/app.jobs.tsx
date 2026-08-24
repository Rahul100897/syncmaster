import { Suspense, useEffect } from "react";
import { defer } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  Await,
  useLoaderData,
  useNavigate,
  useOutletContext,
  useRevalidator,
  useSearchParams,
} from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  IndexTable,
  InlineStack,
  Text,
  useIndexResourceState,
} from "@shopify/polaris";
import { formatDistanceToNow } from "date-fns";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import AppLayout from "../components/AppLayout";
import { SkeletonBlock, SkeletonTable } from "../components/Skeleton";
import type { AppOutletContext } from "./app";
import styles from "../styles/jobs.module.css";

const RUNNING_STATES = ["pending", "running"];

interface JobsData {
  jobs: Array<{
    id: string;
    type: string;
    status: string;
    totalItems: number;
    successItems: number;
    failedItems: number;
    triggeredBy: string;
    sourceShop: string | null;
    targetShop: string | null;
    startedAt: string;
    completedAt: string | null;
  }>;
  selected: {
    id: string;
    type: string;
    status: string;
    events: Array<{
      id: string;
      resourceType: string;
      resourceId: string;
      field: string | null;
      oldValue: string | null;
      newValue: string | null;
      status: string;
      error: string | null;
      createdAt: string;
    }>;
  } | null;
  anyRunning: boolean;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const selectedId = url.searchParams.get("job");

  const data: Promise<JobsData> = (async () => {
    const connections = await prisma.storeConnection.findMany({
      where: { OR: [{ primaryShopId: shop }, { secondaryShopId: shop }] },
      select: { id: true },
    });
    const connectionIds = connections.map((c) => c.id);

    const jobsRaw = await prisma.syncJob.findMany({
      where: { connectionId: { in: connectionIds } },
      orderBy: { startedAt: "desc" },
      take: 50,
    });

    let selected: JobsData["selected"] = null;
    if (selectedId && jobsRaw.some((j) => j.id === selectedId)) {
      const events = await prisma.syncEvent.findMany({
        where: { jobId: selectedId },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      const job = jobsRaw.find((j) => j.id === selectedId);
      selected = {
        id: selectedId,
        type: job?.type ?? "",
        status: job?.status ?? "",
        events: events.map((e) => ({
          id: e.id,
          resourceType: e.resourceType,
          resourceId: e.resourceId,
          field: e.field,
          oldValue: e.oldValue,
          newValue: e.newValue,
          status: e.status,
          error: e.error,
          createdAt: e.createdAt.toISOString(),
        })),
      };
    }

    return {
      jobs: jobsRaw.map((j) => ({
        id: j.id,
        type: j.type,
        status: j.status,
        totalItems: j.totalItems,
        successItems: j.successItems,
        failedItems: j.failedItems,
        triggeredBy: j.triggeredBy,
        sourceShop: j.sourceShop,
        targetShop: j.targetShop,
        startedAt: j.startedAt.toISOString(),
        completedAt: j.completedAt?.toISOString() ?? null,
      })),
      selected,
      anyRunning: jobsRaw.some((j) => RUNNING_STATES.includes(j.status)),
    };
  })();

  return defer({ data });
};

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "running":
      return (
        <InlineStack gap="100" blockAlign="center" wrap={false}>
          <span className={styles.runningDot} />
          <Badge tone="attention">In progress</Badge>
        </InlineStack>
      );
    case "completed":
      return <Badge tone="success">Done</Badge>;
    case "failed":
      return <Badge tone="critical">Failed — needs attention</Badge>;
    case "anomaly":
      return <Badge tone="warning">Anomaly</Badge>;
    default:
      return <Badge>Waiting</Badge>;
  }
}

function EventStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "success":
      return <Badge tone="success">Success</Badge>;
    case "failed":
      return <Badge tone="critical">Failed — needs attention</Badge>;
    case "anomaly":
      return <Badge tone="warning">Anomaly</Badge>;
    default:
      return <Badge>Skipped</Badge>;
  }
}

function duration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return "—";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}m`;
}

/** Merchant-friendly labels for the stored job type / trigger values. */
function typeLabel(t: string): string {
  switch (t) {
    case "migration": return "Product copy";
    case "product": return "Product update";
    case "inventory": return "Inventory update";
    case "restore": return "Backup restore";
    case "metafield": return "Custom data";
    case "metaobject": return "Custom template";
    default: return t;
  }
}

function triggerLabel(t: string): string {
  switch (t) {
    case "manual": return "You";
    case "webhook": return "Automatic";
    case "schedule": return "Scheduled";
    default: return t;
  }
}

function JobsSkeleton() {
  return (
    <BlockStack gap="500">
      <BlockStack gap="100">
        <SkeletonBlock width={160} height={24} />
        <SkeletonBlock width={380} height={14} />
      </BlockStack>
      <SkeletonTable rows={6} columns={6} />
    </BlockStack>
  );
}

function JobsBody({ data }: { data: JobsData }) {
  const { jobs, selected, anyRunning } = data;
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();

  // Auto-refresh every 10s while any job is running (design + spec).
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => {
      if (revalidator.state === "idle") revalidator.revalidate();
    }, 10000);
    return () => clearInterval(id);
  }, [anyRunning, revalidator]);

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(jobs);

  const rowMarkup = jobs.map((job, index) => (
    <IndexTable.Row
      id={job.id}
      key={job.id}
      position={index}
      selected={selectedResources.includes(job.id)}
      onClick={() => {
        const next = new URLSearchParams(searchParams);
        if (searchParams.get("job") === job.id) next.delete("job");
        else next.set("job", job.id);
        setSearchParams(next, { preventScrollReset: true });
      }}
    >
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" fontWeight="medium">
          {typeLabel(job.type)}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <StatusBadge status={job.status} />
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodySm">
          {job.successItems}/{job.totalItems}
          {job.failedItems ? ` (${job.failedItems} failed)` : ""}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{triggerLabel(job.triggeredBy)}</IndexTable.Cell>
      <IndexTable.Cell>
        {formatDistanceToNow(new Date(job.startedAt), { addSuffix: true })}
      </IndexTable.Cell>
      <IndexTable.Cell>{duration(job.startedAt, job.completedAt)}</IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <BlockStack gap="500">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text as="h1" variant="headingXl" fontWeight="bold">
              Sync Activity
            </Text>
            <Text as="p" tone="subdued">
              Every sync that has run. Click one to see the details.
            </Text>
          </BlockStack>
          <Button
            onClick={() => revalidator.revalidate()}
            loading={revalidator.state !== "idle"}
          >
            Refresh
          </Button>
        </InlineStack>

        <Card padding="0">
          {jobs.length === 0 ? (
            <Box padding="800">
              <BlockStack gap="400" inlineAlign="center">
                <svg width="120" height="90" viewBox="0 0 120 90" fill="none" aria-hidden="true">
                  <rect x="8" y="16" width="104" height="58" rx="8" fill="#EEF2FF" />
                  <rect x="22" y="32" width="76" height="8" rx="4" fill="#C7D2FE" />
                  <rect x="22" y="50" width="60" height="6" rx="3" fill="#DBE1FF" />
                  <rect x="22" y="62" width="44" height="6" rx="3" fill="#DBE1FF" />
                </svg>
                <BlockStack gap="100" inlineAlign="center">
                  <Text as="h3" variant="headingMd">No syncs yet</Text>
                  <Text as="p" tone="subdued" alignment="center">
                    Jobs appear here when you run a migration or a real-time sync fires.
                  </Text>
                </BlockStack>
                <Button variant="primary" onClick={() => navigate("/app/sync/preview")}>
                  Run a Safe Sync
                </Button>
              </BlockStack>
            </Box>
          ) : (
            <IndexTable
              resourceName={{ singular: "job", plural: "jobs" }}
              itemCount={jobs.length}
              selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
              onSelectionChange={handleSelectionChange}
              selectable={false}
              headings={[
                { title: "Type" },
                { title: "Status" },
                { title: "Items" },
                { title: "Started by" },
                { title: "Started" },
                { title: "Duration" },
              ]}
            >
              {rowMarkup}
            </IndexTable>
          )}
        </Card>

        {selected ? (
          <Card padding="0">
            <Box padding="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  {typeLabel(selected.type)} · {selected.events.length} steps
                </Text>
                <StatusBadge status={selected.status} />
              </InlineStack>
            </Box>
            <Divider />
            {selected.events.length === 0 ? (
              <Box padding="400">
                <Text as="p" tone="subdued">
                  No events recorded for this job.
                </Text>
              </Box>
            ) : (
              <BlockStack>
                {selected.events.map((e, i) => (
                  <div key={e.id} style={{ background: i % 2 === 0 ? "#FFFFFF" : "#F8F9FF" }}>
                    <Box padding="300" paddingInlineStart="400" paddingInlineEnd="400">
                      <InlineStack align="space-between" blockAlign="center" wrap={false} gap="300">
                        <BlockStack gap="050">
                          <Text as="span" variant="bodyMd" fontWeight="medium">
                            {e.resourceType}: {e.resourceId}
                            {e.field ? ` · ${e.field}` : ""}
                          </Text>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {e.error
                              ? e.error
                              : e.oldValue != null || e.newValue != null
                                ? `${e.oldValue ?? "?"} → ${e.newValue ?? "?"}`
                                : ""}
                          </Text>
                        </BlockStack>
                        <EventStatusBadge status={e.status} />
                      </InlineStack>
                    </Box>
                  </div>
                ))}
              </BlockStack>
            )}
          </Card>
        ) : null}
    </BlockStack>
  );
}

export default function Jobs() {
  const { data } = useLoaderData<typeof loader>();
  const { shop, plan } = useOutletContext<AppOutletContext>();
  return (
    <AppLayout shop={shop} plan={plan}>
      <Suspense fallback={<JobsSkeleton />}>
        <Await resolve={data}>{(resolved) => <JobsBody data={resolved} />}</Await>
      </Suspense>
    </AppLayout>
  );
}
