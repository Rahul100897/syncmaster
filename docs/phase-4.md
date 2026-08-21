# Phase 4 — Billing + App Store Prep + Production Deploy

## Goal
Wire up Shopify billing API, complete all App Store
requirements, and prepare for Railway production deploy.

## Tasks in order

### Task 1 — Shopify Billing API
Create app/lib/billing.server.ts fully:
- Plans:
  Free: default, no charge
  Pro: $29/month, 7-day trial, test:true in dev
- appSubscriptionCreate mutation for Pro upgrade
- isPro(shopId): reads active subscription from Shopify
- Keep SHOP_PLAN_OVERRIDE=pro as dev fallback in .env

Create app/routes/app.billing.tsx:
- Current plan card: name, renewal date, cancel link
- Plan comparison: Free vs Pro side by side
- Upgrade button → Shopify billing approval URL
- After approval: redirect back, confirm subscription active

Wire billing gates into ALL features:
- Real-time sync → isPro() required
- More than 25 products → isPro() required
- Snapshot + rollback → isPro() required
- Analytics → isPro() required
- Sync health monitor → isPro() required
Show upgrade modal for free users on all locked features.

### Task 2 — Activity log page
Create app/routes/app.activity.tsx:
- Table: Date/Time | Action | Resource | Items | Store
- Filter: date range + action type dropdown
- Pagination: cursor-based, 50 rows per page
- Export to CSV button

### Task 3 — Settings page
Create app/routes/app.settings.tsx:
- Store connection management (disconnect, reconnect)
- Email notification preferences (on/off per event type)
- Sync schedule settings (real-time vs off-peak window)
- Danger zone: disconnect all stores, clear all sync data

### Task 4 — App Store prep pages
Create app/routes/privacy.tsx:
- Hosted privacy policy (required by Shopify for submission)
- What data is stored, retention policy, deletion process
- Contact email for data requests

Create app/routes/terms.tsx:
- Terms of service page

Create app/routes/app.checklist.tsx:
- Pre-submission checklist with green/red status indicators:
  [ ] GDPR webhooks responding (200)
  [ ] GraphQL only (no REST calls)
  [ ] Billing API configured and tested
  [ ] Privacy policy URL set in Partner Dashboard
  [ ] Minimal API scopes only
  [ ] App tested on fresh store install
  [ ] Demo video recorded (2-3 min)
  [ ] Screenshots captured (1600x900, min 3)
  [ ] App icon ready (1200x1200px)
  [ ] CLAUDE.md up to date

### Task 5 — Railway deployment config
Create railway.json in project root:
{
  "build": { "builder": "nixpacks" },
  "deploy": {
    "startCommand": "npm run start",
    "healthcheckPath": "/health",
    "restartPolicyType": "on_failure"
  }
}

Create app/routes/health.tsx:
- Returns 200 JSON: { status: "ok", timestamp: Date.now() }
- No authentication required

Create Procfile in root:
web: npm run start
worker: npm run worker

Update package.json scripts:
- "start": "remix-serve build/server/index.js"
- "worker": "tsx app/jobs/worker.ts"

### Task 6 — Final verification + push
- Run npx prisma migrate deploy
- Run npx tsc --noEmit — must be zero errors
- Run npm run build — must pass clean
- Confirm all 3 GDPR webhooks return 200
- Confirm /health returns 200 JSON
- Final commit: "feat: Phase 4 complete — billing, App Store prep, Railway config"
- Merge feature/phase-4-billing into main
- Push main to GitHub

## Verification checklist
- Pro plan billing works via Shopify billing API
- Free users see upgrade modal on all locked features
- Privacy + terms pages load without authentication
- /health endpoint returns 200
- railway.json present in project root
- Procfile present in project root
- npm run build passes with zero errors
- npx tsc --noEmit is clean
- Everything pushed to main on GitHub
