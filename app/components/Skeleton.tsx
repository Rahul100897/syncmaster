import type { CSSProperties } from "react";
import { useLocation, useNavigation } from "@remix-run/react";
import { BlockStack, Box, Card, InlineGrid, InlineStack } from "@shopify/polaris";
import styles from "./Skeleton.module.css";

/** Base shimmer block. Dimensions match the real content they stand in for. */
export function SkeletonBlock({
  width = "100%",
  height = 12,
  radius = 6,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      className={styles.sk}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );
}

/** Mimics a dashboard metric card: colored top border + label + big number + icon. */
export function SkeletonCard() {
  return (
    <Box background="bg-surface" borderRadius="300" borderWidth="025" borderColor="border" shadow="100">
      <div style={{ borderTop: "3px solid #e5e7eb", borderRadius: "12px 12px 0 0" }}>
        <Box padding="400">
          <InlineStack align="space-between" blockAlign="start" wrap={false}>
            <BlockStack gap="300">
              <SkeletonBlock width={90} height={10} />
              <SkeletonBlock width={64} height={28} radius={8} />
            </BlockStack>
            <SkeletonBlock width={22} height={22} radius={6} />
          </InlineStack>
        </Box>
      </div>
    </Box>
  );
}

/** Mimics a data table: shaded header row + N alternating data rows. */
export function SkeletonTable({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  const cols = Array.from({ length: columns });
  return (
    <Card padding="0">
      <Box padding="300" paddingInlineStart="400" paddingInlineEnd="400" background="bg-surface-secondary">
        <InlineStack gap="400" wrap={false}>
          {cols.map((_, i) => (
            <Box key={i} minWidth={i === 0 ? "150px" : "80px"}>
              <SkeletonBlock width={i === 0 ? 110 : 64} height={10} />
            </Box>
          ))}
        </InlineStack>
      </Box>
      <div style={{ borderTop: "1px solid #f1f1f4" }} />
      <BlockStack>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} style={{ background: r % 2 === 0 ? "#FFFFFF" : "#F8F9FF" }}>
            <Box padding="300" paddingInlineStart="400" paddingInlineEnd="400">
              <InlineStack gap="400" blockAlign="center" wrap={false}>
                {cols.map((_, c) => (
                  <Box key={c} minWidth={c === 0 ? "150px" : "80px"}>
                    <SkeletonBlock width={c === 0 ? 140 : 70} height={12} />
                  </Box>
                ))}
              </InlineStack>
            </Box>
          </div>
        ))}
      </BlockStack>
    </Card>
  );
}

/** Mimics a two-column card layout (plan comparison, status panels, etc.). */
export function SkeletonTwoColumn({
  leftLines = 3,
  rightLines = 3,
  withButton = true,
}: {
  leftLines?: number;
  rightLines?: number;
  withButton?: boolean;
}) {
  const column = (lines: number) => (
    <Card>
      <BlockStack gap="400">
        <SkeletonBlock width={160} height={16} />
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonBlock key={i} height={14} />
        ))}
        {withButton ? <SkeletonBlock width={150} height={36} radius={8} /> : null}
      </BlockStack>
    </Card>
  );
  return (
    <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
      {column(leftLines)}
      {column(rightLines)}
    </InlineGrid>
  );
}

/** Mimics a form field row: label on the left, input on the right. */
export function SkeletonFormRow() {
  return (
    <InlineStack align="space-between" blockAlign="center" wrap={false}>
      <SkeletonBlock width={150} height={14} />
      <SkeletonBlock width={220} height={32} radius={8} />
    </InlineStack>
  );
}

/**
 * True when THIS route's loader is (re)loading — i.e. a same-route navigation
 * (filter change, pagination, param update) so we can swap in a skeleton.
 * (Cross-page arrivals mount the new route only after its data resolves, so
 * data-heavy pages that need an arrival skeleton use defer() + Suspense.)
 */
export function useRouteLoading(): boolean {
  const navigation = useNavigation();
  const location = useLocation();
  return (
    navigation.state === "loading" &&
    navigation.location?.pathname === location.pathname
  );
}
