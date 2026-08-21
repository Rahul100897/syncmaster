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
