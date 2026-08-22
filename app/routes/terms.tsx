/**
 * Public terms of service (no authentication).
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

export default function Terms() {
  return (
    <main style={page}>
      <h1 style={h1}>SyncMaster — Terms of Service</h1>
      <p style={muted}>Last updated: August 2026</p>

      <h2 style={h2}>Acceptance</h2>
      <p>
        By installing or using SyncMaster you agree to these terms. If you do not
        agree, do not use the app.
      </p>

      <h2 style={h2}>The service</h2>
      <p>
        SyncMaster synchronises products, inventory, collections, metafields,
        metaobjects, orders, and content between your connected Shopify stores.
        Features vary by plan (Free and Pro).
      </p>

      <h2 style={h2}>Billing</h2>
      <p>
        The Pro plan is $29/month with a 7-day free trial, billed through
        Shopify's billing system. One subscription on your primary store covers
        all connected stores. You can cancel any time from the Billing page.
      </p>

      <h2 style={h2}>Data safety</h2>
      <p>
        SyncMaster never deletes data on a destination store — it only creates or
        updates. Bulk operations take an automatic snapshot first so changes can
        be rolled back. You are responsible for reviewing dry-run previews before
        confirming a sync.
      </p>

      <h2 style={h2}>Liability</h2>
      <p>
        The service is provided "as is". To the maximum extent permitted by law,
        SyncMaster is not liable for indirect or consequential damages arising
        from use of the app.
      </p>

      <h2 style={h2}>Contact</h2>
      <p>
        Questions? Contact{" "}
        <a href="mailto:support@syncmaster.app">support@syncmaster.app</a>.
      </p>
    </main>
  );
}
