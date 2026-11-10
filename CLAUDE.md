# CLAUDE.md — RestoOS

Restaurant management PWA for India (POS, KOT, GST billing, QR menu, staff service bell, SaaS plans).
**Full plan:** `docs/DEVELOPMENT_PLAN.md` — read the relevant sections before every task.

## How to work
- Implement **one task ID at a time** (e.g. `M5-T2`). Start in plan mode, propose, then implement.
- After each task: run `pnpm check`, tick the checkbox in the plan, summarise changes.
- If something isn't covered by the plan, **stop and ask**; then add it to the Decision log (Section 17).
- Don't add dependencies without saying why. Prefer the stack in Section 2.

## Commands
- `pnpm dev` — web (Next.js :3000) + api (Fastify :4000)
- `pnpm check` — typecheck + lint + unit/integration tests (integration tests need `pnpm infra:up`; they use the separate `restoos_test` DB, never the dev DB)
- `pnpm test:e2e` — Playwright (installed Chrome; desktop + 360px)
- Integration tests: name them `*.int.test.ts`, use `createTestDb()` / `resetTestDb()` from `@restoos/db/testing`
- `pnpm infra:up` / `pnpm infra:down` — Postgres (localhost:5434) + Redis (localhost:6380) in Docker
- `pnpm db:migrate` / `pnpm db:reset` / `pnpm db:seed` / `pnpm db:studio` — `db:reset` wipes the DB: always ask the user first (Prisma also blocks it for AI agents without consent)

## Hard rules
1. **Money is integer paise. Tax rates are basis points.** Never use floats for money. All GST math lives in `packages/shared/src/gst.ts`.
2. **Backend owns everything server-side.** All business logic, DB access, auth, sockets, jobs and webhooks live in `apps/api` (Fastify). `apps/web` (Next.js) is frontend only: no Prisma, no Redis, no secrets, no Server Actions, no API route handlers — it calls the API.
3. **Tenant isolation:** API modules use `getTenantDb(ctx)` only — never import the raw Prisma client in `apps/api/src/modules/**`.
4. **Every mutation** checks permission (`requirePermission`) and, where relevant, entitlement (`hasFeature`) **in the API**. Hiding UI is not security.
5. **Never block billing, KOT or printing** because of plan status, network, or a non-critical error.
6. Bills are immutable snapshots; never delete bills or reuse invoice numbers. Cancel with reason.
7. Sensitive actions (void, discount over cap, bill cancel, table merge/transfer, plan override, impersonation) call `audit()`.
8. Offline-capable writes carry a `clientId` and are idempotent on the server.
9. Customer personal data only with recorded consent. Show the Google review link to everyone — no review gating.
10. Validate all API inputs and outputs with zod schemas from `packages/shared` (the web client reuses the same schemas/types).
11. **Owner auth is Google OAuth 2.0 + mobile OTP only** (via Better Auth in `apps/api`). Never build custom sign-up/sign-in or email/password flows. Staff use device-bound PIN login.
12. Respect the click budgets in Section 1 — staff screens must be operable one-handed with large touch targets (≥44px).

## Code conventions
- TypeScript strict, no `any`, no non-null assertions without a comment.
- **API modules:** `apps/api/src/modules/<feature>/{routes.ts, service.ts, *.test.ts}`. `routes.ts` = auth + zod validation + permission/entitlement check + call service + publish event. Business logic in `service.ts` (pure, takes `TenantContext`). Shared helpers in `apps/api/src/lib/` (tenant, permissions, entitlements, events, audit).
- API errors use one shape: `{ error: { code, message } }`. Test routes with Fastify `app.inject()`.
- After a successful write, call `publishEvent()` (in `apps/api`) with a typed event from `packages/shared/src/events.ts`.
- **Web features:** `apps/web/src/features/<feature>/{api.ts, hooks.ts, components/}` — `api.ts` calls the API via `apiFetch()` (`src/lib/api.ts`), `hooks.ts` wraps it in TanStack Query. Server Components by default and read via the API server-side; `"use client"` only where interaction needs it.
- UI: shadcn/ui + Tailwind; mobile-first; support light/dark; Hindi strings via the i18n helper (no hardcoded customer-facing text).
- Visual design follows `DESIGN.md` (tokens, components, do/don't) — read it before any UI task.
- Tests next to code (`*.test.ts`); E2E in `apps/web/e2e`.
- Commit messages: `feat(M5-T2): create KOT on send`.

## UI workflow (every task that touches UI)
Precedence: hard rules above > `DESIGN.md` > `/web-interface-guidelines` > design skills. Skills inform; they never introduce a new palette, font or token set.
1. **Plan** — read the relevant `DESIGN.md` sections. Query `ui-ux-pro-max` for UX rules/patterns of the screen type (`python .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"` — use `python`, not `python3`, on this machine). Use `ui-styling` for shadcn/Tailwind patterns.
2. **Build** — start from shadcn/ui; if a richer component is needed, search 21st.dev (MCP `21st`, needs `API_KEY_21ST`) and adapt it to `DESIGN.md` tokens. State any new dependency and why before adding it.
3. **Polish** — apply `design-taste-frontend` for hierarchy, spacing, motion and critique (app-screen rules for staff/owner, page rules for customer/marketing).
4. **Review** — run `/web-interface-guidelines <changed files>` and fix findings. Project overrides: money via `formatINR(paise)` (not raw `Intl.NumberFormat`); copy through i18n (Title Case for English only); staff screens may skip URL-synced state where it costs taps.
5. **Verify in a browser** — use `playwright-cli` against `pnpm dev`: 360px and tablet widths, light + dark, English + Hindi; count taps against the Section 1 click budgets; check ≥44px targets; save screenshots of each state. Summarise results in the task summary.
Committed E2E tests still use `@playwright/test` in `apps/web/e2e`; `playwright-cli` is for interactive verification.
