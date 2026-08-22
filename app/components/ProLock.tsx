import { useNavigate } from "@remix-run/react";
import { BlockStack, Box, Button, Card, Text } from "@shopify/polaris";

/**
 * Shown in place of a Pro-only feature for Free-plan merchants — the upgrade
 * prompt required by CLAUDE.md ("block real-time sync, show upgrade modal").
 */
export default function ProLock({ feature }: { feature: string }) {
  const navigate = useNavigate();
  return (
    <Card>
      <Box padding="600">
        <BlockStack gap="400" inlineAlign="center">
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="4" y="10" width="16" height="11" rx="2" fill="#EEF2FF" stroke="#6366F1" strokeWidth="1.5" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="12" cy="15.5" r="1.75" fill="#6366F1" />
          </svg>
          <BlockStack gap="100" inlineAlign="center">
            <Text as="h2" variant="headingMd">
              {feature} is a Pro feature
            </Text>
            <Text as="p" tone="subdued" alignment="center">
              Upgrade to Pro ($29/mo, 7-day free trial) to unlock {feature.toLowerCase()},
              real-time sync, and every SyncMaster feature.
            </Text>
          </BlockStack>
          <Button variant="primary" onClick={() => navigate("/app/billing")}>
            Upgrade to Pro
          </Button>
        </BlockStack>
      </Box>
    </Card>
  );
}
