/**
 * Public privacy policy (no authentication) — required for App Store submission.
 * Set this URL in the Partner Dashboard: <app-url>/privacy
 */
const page: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "48px 24px 96px",
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
  color: "#1A1A2E",
  lineHeight: 1.6,
};
const h1: React.CSSProperties = { fontSize: 32, fontWeight: 800, marginBottom: 4 };
const h2: React.CSSProperties = { fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 8 };
const muted: React.CSSProperties = { color: "#6B7280", fontSize: 14 };

export default function Privacy() {
  return (
    <main style={page}>
      <h1 style={h1}>SyncMaster — Privacy Policy</h1>
      <p style={muted}>Last updated: August 2026</p>

      <h2 style={h2}>Who we are</h2>
      <p>
        SyncMaster is a Shopify app that syncs products, inventory, and content
        between a merchant's connected Shopify stores. It runs embedded inside
        Shopify Admin.
      </p>

      <h2 style={h2}>What data we store</h2>
      <p>
        SyncMaster stores only what is needed to operate the sync engine:
      </p>
      <ul>
        <li>Shop domains and OAuth access tokens for the stores you connect.</li>
        <li>
          Sync configuration you create (connections, rules, schedules, payout
          splits).
        </li>
        <li>
          Operational records: sync jobs, sync events, snapshots, and activity
          logs. Snapshots contain product and inventory data from your stores,
          stored in Cloudflare R2 and automatically deleted after 30 days.
        </li>
      </ul>
      <p>
        SyncMaster does <strong>not</strong> collect or store personal customer
        data (names, emails, addresses). Order figures used for analytics and
        payouts are read on demand from Shopify and aggregated — not stored as
        individual customer records.
      </p>

      <h2 style={h2}>How we use it</h2>
      <p>
        Data is used solely to provide the sync features you configure. We do not
        sell data or share it with third parties, except the infrastructure
        providers that host the app (databases, queues, and object storage).
      </p>

      <h2 style={h2}>Data retention &amp; deletion</h2>
      <p>
        Snapshots expire after 30 days. When you uninstall the app or a store is
        redacted, we delete the associated sessions and connection records in
        response to Shopify's mandatory <code>shop/redact</code> and{" "}
        <code>customers/redact</code> webhooks. You can also clear all sync data
        at any time from Settings → Danger zone.
      </p>

      <h2 style={h2}>Contact</h2>
      <p>
        For data requests or questions, contact{" "}
        <a href="mailto:support@syncmaster.app">support@syncmaster.app</a>.
      </p>
    </main>
  );
}
