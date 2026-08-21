# Known Issues Log
Format: [Date] [Phase] [Description] [Status: open/fixed]

- [2026-08-21] [Phase 1] Local dev Postgres is the shared `mv-postgres` Docker
  container (from another project). A dedicated `syncmaster` role + database
  were created on it for isolation, and `prisma migrate dev --name init` ran
  successfully against it. Production must point DATABASE_URL at its own
  Railway Postgres. Status: open (dev-only, expected).

- [2026-08-21] [Phase 1] `shopify app dev` has not been run end-to-end yet: it
  needs interactive Shopify Partner auth + a tunnel, and `client_id` in
  shopify.app.toml is still empty (set on first `shopify app config link`).
  Server boot was verified headlessly with dummy credentials — `/?shop=...`
  returns 302 (auth redirect) and `/app` returns 410 (App Bridge re-auth
  signal), i.e. no import/runtime crashes. Status: open (needs Partner login).

- [2026-08-21] [Phase 1] Build emits a non-fatal CSS warning
  `@media (--p-breakpoints-md-up) and print` — this comes from Polaris's own
  bundled stylesheet, not app code. Build exits 0. Status: open (upstream).

- [2026-08-21] [Phase 1] `@shopify/shopify-api` was pinned to 13.1.0 via
  package.json `overrides`/`resolutions` to resolve a duplicate-version split
  between `@shopify/shopify-app-remix` (wanted 13.1.0) and
  `@shopify/shopify-app-session-storage-prisma` (pulled 12.3.0), which caused a
  TS Session type mismatch. Status: fixed.

- [2026-08-21] [Phase 1] `shopify app dev` rejected scopes
  `read_metafields`/`write_metafields` as invalid — they are not standalone
  Shopify access scopes (removed by Shopify). Metafield access is implicit via
  the owning resource scope (read_products covers product metafields, etc.), so
  metafield sync is unaffected. Removed them from shopify.app.toml, .env,
  .env.example, and corrected CLAUDE.md. Status: fixed.

- [2026-08-21] [Phase 2] The BullMQ worker (`npm run worker`) makes authenticated
  cross-store Admin API calls, so it needs the same env as the web app
  (SHOPIFY_API_KEY/SECRET/APP_URL, DATABASE_URL, REDIS_URL). Locally the app's
  `.env` has empty Shopify keys (dev injects them into the web process only), so
  the worker must be run with real credentials to process jobs. Jobs still
  enqueue durably in Postgres/Redis regardless. On Railway (Phase 4) the platform
  env satisfies this. Status: open (env, expected).
- [2026-08-21] [Phase 2] Migration "Proceed with sync" enqueues a job that upserts
  products via productSet; the pre-sync snapshot step (CLAUDE.md "always snapshot
  before bulk sync") is a documented no-op until Snapshot lands in Phase 3. Status: open (by phase).
- [2026-08-21] [Phase 2] Route-adjacent CSS modules must NOT live in app/routes/
  (flat-routes parses them as route modules and the build fails). jobs pulse CSS
  lives in app/styles/. Status: fixed.

- [2026-08-21] [Phase 3] Snapshots upload to Cloudflare R2; the local `.env` has
  empty R2_* vars, so snapshot create/restore/download only work once R2
  credentials are set (Railway provides them in prod). `createSnapshot` marks
  the row `failed` and surfaces the real error if R2 isn't configured, and the
  pre-sync auto-snapshot logs+continues rather than hard-blocking dev. Status: open (env, expected).
- [2026-08-21] [Phase 3] Sync rules: field enable/disable + direction gates are
  applied in the write path (inventory direction, metafield/metaobject toggles).
  Price markup/fixed/rounding and the inventory buffer % are saved to SyncRule
  and fully editable in the UI, but not yet applied inside productSet/inventory
  writes — that wiring is a follow-on. Status: open (by phase).
- [2026-08-21] [Phase 3] Analytics + payouts fetch orders live via GraphQL
  (read_orders) capped at 500 orders/store per range (reported as truncated when
  hit); bulkOperationRunQuery is the future path for very high-volume stores. Status: open (by design).
