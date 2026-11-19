# RestoOS — Development Plan (Claude Code–ready)

> Working name: **RestoOS**. Replace throughout once the brand is final.
>
> This document is the single source of truth for building the MVP. It is written so Claude Code can execute it milestone by milestone. Pair it with `CLAUDE.md` in the repo root.

---

## 0. How to use this plan with Claude Code

1. Put `CLAUDE.md` and this file (`docs/DEVELOPMENT_PLAN.md`) in the repo.
2. Work **one task at a time**, in order. Each task has an ID (e.g. `M3-T2`) and acceptance criteria.
3. Suggested prompt per task:
   > Read CLAUDE.md and docs/DEVELOPMENT_PLAN.md. Implement task **M3-T2** only. Start in plan mode, show me the plan, then implement. Add tests that prove the acceptance criteria. Run `pnpm check`. When done, tick the task's checkbox in the plan and summarise what changed.
4. Do not start a milestone until the previous one's acceptance criteria pass.
5. If a task reveals a decision not covered here, stop and ask, then record the decision in **Section 17 (Decision log)**.

---

## 1. Product summary

A **web-only (PWA)** restaurant platform for the Indian market with three experiences in one Next.js app:

| Experience | Who | Entry point | Device |
|---|---|---|---|
| **Customer** | Diners | Scan table QR / tap NFC → `/t/[tableToken]` | Customer's phone, no login |
| **Staff** | Butler, Cashier, Kitchen, Manager | `/staff` — PIN login on a registered device | Staff phones, counter tablet, kitchen tablet |
| **Owner** | Owner / admin | `/owner` — Google sign-in or mobile OTP | Phone or laptop |
| **Platform admin** | RestoOS team | `/admin` | Laptop |

**Core differentiator:** the **service bell + accountability system** — customers ring a specific role, the call is routed to the assigned staff member, escalated if not answered, and every response (accepted / busy / missed / done) is logged for staff performance analytics.

**Non-negotiable MVP foundations:** GST-compliant billing, KOT/kitchen display, thermal printing, offline billing, role-based permissions, least-clicks UX.

**Monetisation:** monthly/annual subscription tiers (Starter / Growth / Pro) + a one-time **Lifetime Growth** licence with mandatory AMC from year 2. Features are gated by **entitlements**, never by plan names.

### UX click budgets (treat as acceptance criteria)

| Task | Budget |
|---|---|
| Butler takes an order | Tap table → tap items → "Send to kitchen" |
| Cashier bills and prints | Tap table → "Bill" (auto-prints) — **2 taps** |
| Staff responds to bell | Notification → "Accept" — **1 tap** |
| Customer rings bell | "🔔" → choose role — **2 taps** |
| Owner sees today | Open app — **0 taps** |

---

## 2. Tech stack (decided)

| Concern | Choice | Notes |
|---|---|---|
| Monorepo | **pnpm workspaces + Turborepo** | |
| Backend API | **Node.js + Fastify 5 + TypeScript (strict)** in `apps/api` | Owns **everything server-side**: business logic, Prisma/DB, auth (owner + staff), REST API under `/api`, Socket.io, BullMQ workers, webhooks, offline sync, exports. Validation with zod via `fastify-type-provider-zod` (schemas from `packages/shared`); OpenAPI docs via `@fastify/swagger` |
| Web app | **Next.js (latest stable, App Router) + TypeScript (strict)** — **frontend only** | Renders UI and the PWA. Server Components read from the API server-side (forwarding the user's cookies); client components call the API through a typed client + TanStack Query. **No business logic, DB access, Server Actions or API Route Handlers in Next.js** |
| UI | **Tailwind CSS + shadcn/ui**, `lucide-react` icons | Mobile-first, large touch targets (min 44px) |
| Client data | **TanStack Query** for client-side fetching/caching in staff screens | |
| Forms & validation | **react-hook-form + zod**; zod schemas shared in `packages/shared` | |
| Database | **PostgreSQL 16** | |
| ORM | **Prisma** | Migrations via `prisma migrate` |
| Cache / pub-sub / queues | **Redis** + **BullMQ** | Bell escalation timers, WhatsApp sends, reminders |
| Real-time | **Socket.io** attached to the Fastify server in `apps/api` (Redis adapter when scaled horizontally) | Same process as the API, so `publishEvent()` emits directly |
| Auth (owner) | **Google OAuth 2.0** + **mobile OTP** only, wired through **Better Auth** mounted in `apps/api` at `/api/auth/*` (Google social provider + phone-number plugin) | No custom sign-up/sign-in and no email/password. A first login by either method creates the account; Google and phone can be linked to the same owner. Re-evaluate if it blocks; record in decision log |
| Auth (staff) | Custom **device-bound PIN sessions** | See Section 6.3 |
| Push | **Web Push (VAPID)** via `web-push` | |
| PWA / offline | **Serwist** (service worker) + **Dexie** (IndexedDB) | |
| Excel | **exceljs** | Template generation + import parsing |
| PDF | **@react-pdf/renderer** | Bills, QR sheets |
| QR | `qrcode` | |
| Printing | Custom ESC/POS builder in `packages/print`; **WebUSB / Web Bluetooth** drivers; optional LAN **print bridge** | |
| Payments (customer UPI) | UPI intent QR (`upi://pay?...`) generated locally; gateway QR + webhook (Razorpay) for auto-confirmation | |
| Payments (our SaaS billing) | **Razorpay Subscriptions** + one-time Orders | |
| WhatsApp | Provider-agnostic interface; first adapter for a WhatsApp BSP (decide in M7) | |
| File storage | S3-compatible (AWS S3 Mumbai) | Menu images, PDFs |
| Testing | **Vitest** (unit/integration), **Playwright** (E2E) | |
| Observability | **Sentry**, structured logs (pino) | |
| Deployment | **Docker** on AWS Mumbai (EC2/Lightsail) behind **Caddy**; Postgres on RDS Mumbai; Redis managed or containerised | |

---

## 3. Architecture overview

```
 Customer phone ─┐                       Caddy (one domain, TLS)
 Staff devices  ─┼──► https://app.… ──┬── /api/*, /socket.io/* ──► apps/api
 Owner browser  ─┘                    └── everything else ───────► apps/web

 ┌──────────────────────────────────┐   REST /api/*    ┌───────────────────────────────────┐
 │ apps/web  (Next.js, frontend)    │ ───────────────► │ apps/api  (Node.js + Fastify)     │
 │ /t/* /staff/* /owner/* /admin/*  │   (server-side   │ • REST routes (zod-validated)     │
 │ Server Components (read via API) │    fetch with    │ • Better Auth  /api/auth/*        │
 │ Client: TanStack Query + typed   │    cookies, or   │ • Staff PIN sessions, permissions │
 │ API client · Socket.io client    │    from browser) │ • Services + getTenantDb (Prisma) │
 │ Service Worker (Serwist) + Dexie │ ◄─── sockets ─── │ • Socket.io gateway (rooms)       │
 └──────────────────────────────────┘                  │ • BullMQ workers (bell escalation,│
                                                       │   push, WhatsApp, reminders)      │
 Razorpay / WhatsApp webhooks ───────────────────────► │ • Webhooks, /api/sync, exports    │
                                                       └──────┬──────────────────┬─────────┘
 LAN printers ◄── apps/print-bridge (optional)                │ Prisma           │ ioredis
                                                       ┌──────▼──────┐   ┌───────▼────────┐
                                                       │ PostgreSQL  │   │ Redis (BullMQ, │
                                                       └─────────────┘   │ cache, adapter)│
                                                                         └────────────────┘
```

**Rules:**
- **All reads and writes go through `apps/api`.** `apps/web` never touches the database, Redis or secrets; it only calls the API.
- A write = route (auth + zod validation + permission/entitlement check) → `service.ts` → DB → `publishEvent()` → Socket.io rooms.
- Browser and API share one origin (Caddy in prod, Next.js `rewrites` of `/api/*` in dev), so auth cookies are first-party and there is no CORS for the app itself.
- Workers run from the same `apps/api` codebase (a separate `worker` entry point so they can scale independently).

---

## 4. Repository structure

```
restoos/
├─ CLAUDE.md
├─ docs/
│  └─ DEVELOPMENT_PLAN.md
├─ apps/
│  ├─ api/                      # Node.js + Fastify backend — owns all server-side logic
│  │  └─ src/
│  │     ├─ modules/<feature>/  # menu, floor, orders, billing, bell, staff, devices, sync, ...
│  │     │  ├─ routes.ts        # Fastify routes: auth, zod schemas, permission check, call service
│  │     │  ├─ service.ts       # business logic (pure, takes TenantContext)
│  │     │  └─ *.test.ts
│  │     ├─ lib/                # tenant (getTenantDb), permissions, entitlements, events, audit
│  │     ├─ plugins/            # Fastify plugins: auth, session, rate-limit, errors, socket
│  │     ├─ socket/             # Socket.io gateway + room joining
│  │     ├─ jobs/               # BullMQ queues + processors
│  │     ├─ app.ts              # buildApp() — used by server, worker and tests
│  │     ├─ server.ts           # HTTP + Socket.io entry
│  │     └─ worker.ts           # BullMQ worker entry
│  ├─ web/                      # Next.js — frontend only (no DB, no business logic)
│  │  ├─ src/app/
│  │  │  ├─ (customer)/t/[tableToken]/...     # menu, cart, bell, bill, feedback
│  │  │  ├─ (staff)/staff/...                 # login, tables, order, kitchen, bills, bell
│  │  │  ├─ (owner)/owner/...                 # dashboard, menu, floor, staff, reports, billing
│  │  │  └─ (admin)/admin/...                 # platform admin
│  │  ├─ src/features/<feature>/{api.ts, hooks.ts, components/}  # API calls, TanStack Query hooks, UI
│  │  ├─ src/lib/               # api client, socket client, i18n, formatting
│  │  └─ src/sw/                # service worker (Serwist)
│  └─ print-bridge/             # (M6, optional) tiny Node app for LAN printers
├─ packages/
│  ├─ db/                       # Prisma schema, client, seed
│  ├─ shared/                   # zod schemas, enums, event types, money/GST utils
│  ├─ print/                    # ESC/POS builder + receipt/KOT templates
│  └─ config/                   # eslint, tsconfig, tailwind presets
├─ docker-compose.yml           # postgres, redis (local dev)
├─ turbo.json
└─ package.json
```

**Feature module rule:** in `apps/api`, business logic lives in `service.ts` (pure, testable, takes a `TenantContext`). `routes.ts` only does auth, zod validation, permission/entitlement checks, calls the service, and publishes events. In `apps/web`, `features/<feature>/api.ts` wraps the API calls and `hooks.ts` exposes them as TanStack Query hooks; request/response types come from the shared zod schemas in `packages/shared`.

---

## 5. Domain rules (read before touching related code)

### 5.1 Money and tax
- All money is **integer paise** (`Int`). Never floats. Display via `formatINR(paise)`.
- Tax rates are **basis points** (`500` = 5%).
- Each menu item has `taxRateBps` and the outlet has `pricesIncludeTax: boolean`.
- GST split for intra-state dine-in: **CGST = SGST = rate / 2**. Support IGST in the data model (`taxType`) but MVP defaults to CGST+SGST.
- Calculation order per bill (implemented in `packages/shared/src/gst.ts`, M0-T5): line subtotal → item-level discount → bill-level discount (allocated proportionally across lines, largest-remainder) → taxable value (inclusive prices backed out so taxable + tax = price) → **optional service charge** on the taxable value (allocated to lines by taxable value) → **GST per line on taxable value + service-charge share, at the line's rate** → round-off to nearest rupee (half-up) as its own line. **GST is charged on the service charge** (decision 2026-11-14, common practice — CA to confirm before launch). Rounding: half-up in integer paise per line; CGST = SGST = rate/2 rounded separately so the halves are always equal.
- **Service charge must be optional**, off by default per outlet, shown as a separate line, and removable at billing time. (Indian consumer guidelines treat compulsory service charges as unfair; confirm current position with a lawyer before launch.)
- Bill PDF/print must show: legal name, outlet address, **GSTIN**, **FSSAI licence no.**, invoice number, date/time, HSN/SAC, taxable value, CGST/SGST per rate, total, round-off, payment mode(s).
- All GST rate logic goes in `packages/shared/src/gst.ts` with exhaustive unit tests.

### 5.2 Invoice numbering
- Unique and consecutive **per outlet per financial year (Apr–Mar)**, max 16 characters.
- Format: `{outletCode}-{FY}-{deviceCode}{seq}` e.g. `A1-2627-D1000045` — exactly 16 chars: outlet code 2 (`[A-Z0-9]{2}`, unique per organisation, fixed once billed), FY 4 (`2627` = Apr 2026–Mar 2027, IST), device code 2, sequence 6 zero-padded (≤ 999,999 bills per device per FY). Helpers: `formatInvoiceNumber()` / `financialYear()` in `packages/shared/src/india.ts`.
- Each billing device gets a **pre-allocated block** of sequence numbers (e.g. 500) so it can bill offline without collisions. Unused numbers in a returned block are recorded as `CANCELLED`/skipped in the register.
- Bills are never deleted. Cancellation creates a cancelled status with reason + actor (and a credit note in phase 2).

### 5.3 Tenancy
- `Organization` (the business) → `Outlet` (a location). Almost every table carries `organizationId`, and outlet-level data carries `outletId`.
- Every service function receives a `TenantContext { organizationId, outletId?, actor }`.
- **All Prisma access goes through `getTenantDb(ctx)`** — a Prisma client extension that injects `organizationId` (and `outletId` where applicable) into every query. Direct `prisma.*` usage in `apps/api/src/modules/**` is a lint error (only `apps/api/src/lib/tenant.ts`, platform-admin code and `packages/db` may use the raw client). `apps/web` has no database access at all.
- Tests must include a cross-tenant leak test for every new model.

### 5.4 Roles and permissions

Roles: `OWNER`, `MANAGER`, `CASHIER`, `BUTLER`, `KITCHEN`. Permissions are code-defined constants mapped to roles (owner can customise later in phase 2).

| Permission | Owner | Manager | Cashier | Butler | Kitchen |
|---|:-:|:-:|:-:|:-:|:-:|
| `menu.edit` | ✅ | ✅ | | | |
| `menu.toggleStock` | ✅ | ✅ | ✅ | | ✅ |
| `floor.edit` | ✅ | ✅ | | | |
| `table.assign` | ✅ | ✅ | | | |
| `order.create` | ✅ | ✅ | ✅ | ✅ | |
| `order.voidItem` | ✅ | ✅ | | | |
| `kot.updateStatus` | ✅ | ✅ | | | ✅ |
| `bill.create` | ✅ | ✅ | ✅ | | |
| `bill.discount` (up to `outlet.maxCashierDiscountBps`) | ✅ | ✅ | ✅* | | |
| `bill.cancel` | ✅ | ✅ | | | |
| `bill.reprint` | ✅ | ✅ | ✅ | | |
| `payment.record` | ✅ | ✅ | ✅ | | |
| `bell.respond` | ✅ | ✅ | ✅ | ✅ | |
| `reports.view` | ✅ | ✅ | | | |
| `staff.manage` | ✅ | ✅ | | | |
| `billing.manageSubscription` | ✅ | | | | |

`*` capped by outlet setting. Implement as `can(actor, permission, resource?)` in `apps/api/src/lib/permissions.ts`, enforced **in the API** on every route (`requirePermission()` as a Fastify `preHandler`); the web UI hides what the user can't do using the actor's permissions returned by `GET /api/me`.

### 5.5 Entitlements (plans)
- Code never checks plan names. It checks `hasFeature(outletId, FeatureKey)` and `getLimit(outletId, LimitKey)`.
- Feature keys (MVP): `POS_CORE`, `QR_MENU`, `OFFLINE`, `BELL_SYSTEM`, `STAFF_ANALYTICS`, `CUSTOMER_SELF_ORDER`, `WHATSAPP_BILLS`, `CRM`, `REVIEW_FLOW_FULL`, `INVENTORY`, `AGGREGATORS`, `AI_INSIGHTS`, `MULTI_OUTLET`.
- Limit keys: `MAX_STAFF`, `MAX_OUTLETS`.
- Entitlements resolve from: active Subscription **or** valid Licence (+ AMC status) **plus** AddOnPurchases. Cache per outlet in Redis (60s TTL), bust on change.
- **Core mode** (lapsed AMC/subscription after grace): only `POS_CORE` + `OFFLINE` stay on. **Never block billing, KOT or printing mid-service.** Data export is always available.

### 5.6 Table status state machine
```
FREE → OCCUPIED → ORDERED → BILL_REQUESTED → PAID → CLEANING → FREE
          ↑______________ (more items) ______|
```
- A `TableSession` opens on first order or manual "Seat". It closes on `PAID` (→ `CLEANING`). Staff tap "Cleaned" → `FREE`. Optional outlet setting: auto-free after N minutes.
- Merge/transfer move orders between sessions and are audit-logged.

### 5.7 Bell state machine (core differentiator)
```
RUNG → NOTIFYING(level 0: assigned staff)
     → [ACCEPTED → DONE] | [DECLINED_BUSY or TIMEOUT → NOTIFYING(level+1)]
     → level 1: other on-shift staff of target role in the same section
     → level 2: on-duty manager
     → UNANSWERED (after final level times out)
Customer may CANCEL while not yet ACCEPTED.
```
- Each notification to a person is a **BellAttempt** with outcome: `ACCEPTED | DECLINED_BUSY | MISSED | SUPERSEDED`. A `MISSED` is recorded against that person even if someone else later accepts.
- Timeouts: default 30s per level (outlet setting, 15–90s). Implemented as **BullMQ delayed jobs**; accepting cancels the pending job.
- `DECLINED_BUSY` requires a quick reason: `WITH_ANOTHER_TABLE | IN_KITCHEN | ON_BREAK | OTHER`.
- After `ACCEPTED`, staff tap **Done**. Customer sees "Coming 🙋" then can give 👍/👎 on the resolved request.
- Abuse protection: one active bell per table per target role; 20s cooldown after cancel; manager can **mute a table** for 30 min; table tokens can be rotated.
- Routing for `CASHIER` and `MANAGER` targets skips level 0 table assignment and notifies on-shift people of that role directly.
- Metrics derived from BellAttempts: response time (rung → accepted), resolution time (accepted → done), miss rate, decline rate, customer thumbs.

### 5.8 Customer data and consent
- Customer capture is optional. Phone/name/email stored only with explicit consent: checkbox with purpose text, timestamp, and policy version (`CustomerConsent`).
- Marketing messages only to customers with `marketing` consent. Separate from transactional (bill on WhatsApp).
- Provide owner-side "delete customer" that anonymises personal fields on related bills.

### 5.9 Google reviews
- Show the Google review link to **every** customer after payment. Never filter by rating (no review gating).
- Separately collect a private 1–5 rating; ratings ≤2 alert the manager in real time.

---

## 6. Data model

### 6.1 Prisma schema (starting point)

> **Source of truth is now `packages/db/prisma/schema.prisma`** (implemented in M0-T2); the block below is the original starting point. Implemented differences: Prisma 7 syntax (`prisma-client` generator, URL in `prisma.config.ts`), `cuid(2)` ids, `organizationId` on **every** tenant table (child rows too), full `@relation`s (`Restrict` for bills/orders/payments, `Cascade` only for editable menu children and sessions), `createdAt`/`updatedAt` everywhere except append-only ledgers (`AuditLog`, `MessageCredit`), `MenuCategory.nameHi`, `ItemVariant.sortOrder`, `Payment.clientId` (offline idempotency), `PlanFeature.limitValue = -1` means unlimited.
>
> Original conventions: `id` = cuid2 string, `createdAt`/`updatedAt` on every model, money in paise (`Int`), rates in bps (`Int`). Add indexes on every `organizationId`, `outletId`, and frequently filtered status/time fields. Better Auth adds its own tables (`user`, `session`, `account`, `verification`); `OwnerAccount` links to its `userId`.

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

// ───────────── Tenancy & people ─────────────
model Organization {
  id           String   @id @default(cuid())
  name         String
  legalName    String
  gstin        String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  outlets      Outlet[]
  owners       OwnerAccount[]
}

model OwnerAccount {
  id             String   @id @default(cuid())
  organizationId String
  authUserId     String   @unique          // Better Auth user id
  role           OrgRole  @default(OWNER)  // OWNER | ADMIN
  createdAt      DateTime @default(now())
  organization   Organization @relation(fields: [organizationId], references: [id])
  @@index([organizationId])
}

model Outlet {
  id                      String   @id @default(cuid())
  organizationId          String
  code                    String                   // short code used in invoice numbers, e.g. "A1"
  name                    String
  address                 String
  stateCode               String                   // GST state code
  gstin                   String?
  fssaiNumber             String?
  pricesIncludeTax        Boolean  @default(false)
  serviceChargeBps        Int      @default(0)     // 0 = off
  maxCashierDiscountBps   Int      @default(1000)
  bellTimeoutSeconds      Int      @default(30)
  googleReviewUrl         String?
  orderingMode            OrderingMode @default(VIEW_ONLY) // VIEW_ONLY | SELF_ORDER_APPROVAL | SELF_ORDER
  timezone                String   @default("Asia/Kolkata")
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
  organization            Organization @relation(fields: [organizationId], references: [id])
  @@unique([organizationId, code])
  @@index([organizationId])
}

model Employee {
  id             String    @id @default(cuid())
  organizationId String
  outletId       String
  name           String
  phone          String?
  role           StaffRole                       // MANAGER | CASHIER | BUTLER | KITCHEN
  pinHash        String                          // argon2
  isActive       Boolean   @default(true)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  @@index([organizationId, outletId])
}

model Device {
  id             String   @id @default(cuid())
  organizationId String
  outletId       String
  code           String                          // "D2" — used in invoice numbers
  label          String                          // "Counter tablet"
  deviceSecretHash String                        // registration secret, rotatable
  isStation      Boolean  @default(false)        // station mode for loud bell
  lastSeenAt     DateTime?
  createdAt      DateTime @default(now())
  @@unique([outletId, code])
}

model StaffSession {
  id          String   @id @default(cuid())
  employeeId  String
  deviceId    String
  tokenHash   String   @unique
  expiresAt   DateTime                           // e.g. 14h (one shift)
  createdAt   DateTime @default(now())
  @@index([employeeId])
}

model Shift {                                    // who is on duty right now
  id          String    @id @default(cuid())
  outletId    String
  employeeId  String
  startedAt   DateTime  @default(now())
  endedAt     DateTime?
  @@index([outletId, endedAt])
}

model PushSubscription {
  id          String   @id @default(cuid())
  employeeId  String
  deviceId    String
  endpoint    String   @unique
  p256dh      String
  auth        String
  createdAt   DateTime @default(now())
  lastOkAt    DateTime?
}

// ───────────── Floor ─────────────
model Section {
  id        String  @id @default(cuid())
  outletId  String
  name      String
  sortOrder Int     @default(0)
}

model DiningTable {
  id          String      @id @default(cuid())
  outletId    String
  sectionId   String
  label       String                              // "T12"
  seats       Int         @default(4)
  qrToken     String      @unique                 // random, rotatable
  status      TableStatus @default(FREE)
  posX        Int         @default(0)             // simple grid layout
  posY        Int         @default(0)
  mutedUntil  DateTime?
  @@unique([outletId, label])
}

model TableAssignment {
  id          String    @id @default(cuid())
  outletId    String
  tableId     String
  employeeId  String                              // butler
  shiftId     String
  createdAt   DateTime  @default(now())
  endedAt     DateTime?
  @@index([tableId, endedAt])
}

model TableSession {
  id          String    @id @default(cuid())
  outletId    String
  tableId     String
  openedAt    DateTime  @default(now())
  closedAt    DateTime?
  guestCount  Int?
  @@index([tableId, closedAt])
}

// ───────────── Menu ─────────────
model MenuCategory {
  id        String  @id @default(cuid())
  outletId  String
  name      String
  sortOrder Int     @default(0)
  isActive  Boolean @default(true)
}

model MenuItem {
  id           String   @id @default(cuid())
  outletId     String
  categoryId   String
  code         String?                           // short code for fast staff search
  name         String
  nameHi       String?
  description  String?
  imageUrl     String?
  dietType     DietType                          // VEG | NON_VEG | EGG
  basePrice    Int                               // paise
  taxRateBps   Int
  hsnSac       String?
  inStock      Boolean  @default(true)
  isActive     Boolean  @default(true)
  sortOrder    Int      @default(0)
  variants     ItemVariant[]
  addOnGroups  ItemAddOnGroup[]
  @@unique([outletId, code])
}

model ItemVariant {                              // Half / Full
  id        String  @id @default(cuid())
  itemId    String
  name      String
  price     Int
  item      MenuItem @relation(fields: [itemId], references: [id])
}

model AddOnGroup {
  id        String  @id @default(cuid())
  outletId  String
  name      String                               // "Extras"
  minSelect Int     @default(0)
  maxSelect Int     @default(1)
  addOns    AddOn[]
}

model AddOn {
  id        String  @id @default(cuid())
  groupId   String
  name      String
  price     Int
  group     AddOnGroup @relation(fields: [groupId], references: [id])
}

model ItemAddOnGroup {
  itemId    String
  groupId   String
  item      MenuItem @relation(fields: [itemId], references: [id])
  @@id([itemId, groupId])
}

model MenuImport {
  id          String   @id @default(cuid())
  outletId    String
  fileUrl     String
  status      ImportStatus                       // VALIDATED | COMMITTED | FAILED
  rowCount    Int
  errorCount  Int
  errors      Json                               // [{row, column, message}]
  createdById String
  createdAt   DateTime @default(now())
}

// ───────────── Orders & kitchen ─────────────
model Order {
  id             String      @id @default(cuid())
  outletId       String
  tableSessionId String?
  source         OrderSource                     // STAFF | CUSTOMER | AGGREGATOR
  status         OrderStatus @default(OPEN)      // PENDING_APPROVAL | OPEN | BILLED | CANCELLED
  createdById    String?                         // employee
  clientId       String      @unique             // idempotency key from device (offline sync)
  createdAt      DateTime    @default(now())
  items          OrderItem[]
}

model OrderItem {
  id           String          @id @default(cuid())
  orderId      String
  itemId       String
  variantId    String?
  nameSnapshot String
  unitPrice    Int                               // snapshot incl. add-ons
  taxRateBps   Int                               // snapshot
  quantity     Int
  note         String?
  status       OrderItemStatus @default(NEW)     // NEW | SENT | PREPARING | READY | SERVED | VOIDED
  kotId        String?
  voidReason   String?
  voidedById   String?
  addOns       Json                              // [{addOnId, name, price}]
  order        Order @relation(fields: [orderId], references: [id])
}

model Kot {
  id         String   @id @default(cuid())
  outletId   String
  orderId    String
  number     Int                                 // daily running number per outlet
  station    String   @default("KITCHEN")        // future: BAR, etc.
  printedAt  DateTime?
  createdAt  DateTime @default(now())
}

// ───────────── Billing ─────────────
model InvoiceBlock {
  id          String   @id @default(cuid())
  outletId    String
  deviceId    String
  fy          String                             // "2627"
  startSeq    Int
  endSeq      Int
  nextSeq     Int
  createdAt   DateTime @default(now())
  @@index([outletId, fy])
}

model Bill {
  id               String     @id @default(cuid())
  outletId         String
  tableSessionId   String?
  invoiceNumber    String
  fy               String
  status           BillStatus @default(UNPAID)  // UNPAID | PARTIALLY_PAID | PAID | CANCELLED
  subtotal         Int
  discountTotal    Int
  taxableTotal     Int
  cgstTotal        Int
  sgstTotal        Int
  igstTotal        Int        @default(0)
  serviceCharge    Int        @default(0)
  roundOff         Int                           // can be negative
  grandTotal       Int
  lines            Json                          // immutable snapshot of computed lines
  taxBreakup       Json                          // per-rate breakup for printing
  customerId       String?
  createdById      String
  deviceId         String
  clientId         String     @unique            // idempotency key
  cancelReason     String?
  cancelledById    String?
  createdAt        DateTime   @default(now())
  payments         Payment[]
  @@unique([outletId, invoiceNumber])
  @@index([outletId, createdAt])
}

model Payment {
  id           String        @id @default(cuid())
  billId       String
  mode         PaymentMode                       // CASH | CARD | UPI | OTHER
  amount       Int
  reference    String?                           // UPI txn id / gateway id
  status       PaymentStatus @default(SUCCEEDED)
  recordedById String?
  createdAt    DateTime      @default(now())
  bill         Bill @relation(fields: [billId], references: [id])
}

// ───────────── Customers & feedback ─────────────
model Customer {
  id             String   @id @default(cuid())
  organizationId String
  phone          String?
  name           String?
  email          String?
  createdAt      DateTime @default(now())
  consents       CustomerConsent[]
  @@unique([organizationId, phone])
}

model CustomerConsent {
  id            String      @id @default(cuid())
  customerId    String
  purpose       ConsentPurpose                   // TRANSACTIONAL | MARKETING
  policyVersion String
  grantedAt     DateTime    @default(now())
  withdrawnAt   DateTime?
  customer      Customer @relation(fields: [customerId], references: [id])
}

model Feedback {
  id         String   @id @default(cuid())
  outletId   String
  billId     String?
  rating     Int                                 // 1–5, private
  comment    String?
  alertedAt  DateTime?
  createdAt  DateTime @default(now())
}

// ───────────── Bell system ─────────────
model BellEvent {
  id             String      @id @default(cuid())
  outletId       String
  tableId        String
  tableSessionId String?
  targetRole     BellTarget                      // BUTLER | CASHIER | MANAGER
  status         BellStatus  @default(NOTIFYING) // NOTIFYING | ACCEPTED | DONE | CANCELLED | UNANSWERED
  level          Int         @default(0)
  acceptedById   String?
  rungAt         DateTime    @default(now())
  acceptedAt     DateTime?
  doneAt         DateTime?
  customerThumb  Int?                            // 1 = 👍, -1 = 👎
  attempts       BellAttempt[]
  @@index([outletId, rungAt])
  @@index([tableId, status])
}

model BellAttempt {
  id            String        @id @default(cuid())
  bellEventId   String
  employeeId    String
  level         Int
  notifiedAt    DateTime      @default(now())
  respondedAt   DateTime?
  outcome       AttemptOutcome?                  // ACCEPTED | DECLINED_BUSY | MISSED | SUPERSEDED
  declineReason DeclineReason?
  pushDelivered Boolean?                         // from push send result
  bellEvent     BellEvent @relation(fields: [bellEventId], references: [id])
  @@index([employeeId, notifiedAt])
}

// ───────────── SaaS billing & entitlements ─────────────
model Plan {
  id           String        @id @default(cuid())
  key          String        @unique             // STARTER | GROWTH | PRO | LIFETIME_GROWTH
  name         String
  kind         PlanKind                          // SUBSCRIPTION | LIFETIME
  monthlyPrice Int?
  annualPrice  Int?
  oneTimePrice Int?
  amcPrice     Int?
  isActive     Boolean       @default(true)
  features     PlanFeature[]
}

model PlanFeature {
  planId     String
  featureKey String                              // FeatureKey or LimitKey
  limitValue Int?                                // null = boolean feature
  plan       Plan @relation(fields: [planId], references: [id])
  @@id([planId, featureKey])
}

model Subscription {
  id                 String             @id @default(cuid())
  outletId           String             @unique
  planId             String
  interval           BillingInterval                // MONTHLY | ANNUAL
  status             SubscriptionStatus             // TRIALING | ACTIVE | PAST_DUE | GRACE | CORE_MODE | CANCELLED
  gatewaySubId       String?
  currentPeriodEnd   DateTime
  trialEndsAt        DateTime?
  graceEndsAt        DateTime?
  pendingPlanId      String?                        // downgrade at period end
  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt
}

model Licence {
  id           String        @id @default(cuid())
  outletId     String        @unique
  planId       String
  purchasedAt  DateTime
  amcDueDate   DateTime
  status       LicenceStatus                    // ACTIVE | AMC_DUE | GRACE | CORE_MODE
  graceEndsAt  DateTime?
}

model AddOnPurchase {
  id          String    @id @default(cuid())
  outletId    String
  featureKey  String
  limitValue  Int?
  validUntil  DateTime?                          // null = lifetime (still subject to AMC)
  createdAt   DateTime  @default(now())
}

model PlatformInvoice {                          // our GST invoices to restaurants
  id            String   @id @default(cuid())
  organizationId String
  invoiceNumber String   @unique
  amount        Int
  gstAmount     Int
  description   String
  gatewayRef    String?
  pdfUrl        String?
  createdAt     DateTime @default(now())
}

model MessageCredit {                            // WhatsApp credit ledger
  id          String   @id @default(cuid())
  organizationId String
  delta       Int                                // + purchase, − usage
  reason      String
  createdAt   DateTime @default(now())
}

// ───────────── Audit ─────────────
model AuditLog {
  id             String   @id @default(cuid())
  organizationId String
  outletId       String?
  actorType      String                          // OWNER | EMPLOYEE | SYSTEM | ADMIN
  actorId        String?
  action         String                          // "bill.cancel", "order.voidItem", ...
  entity         String
  entityId       String
  data           Json?
  createdAt      DateTime @default(now())
  @@index([organizationId, createdAt])
}

// ───────────── Enums ─────────────
enum OrgRole { OWNER ADMIN }
enum StaffRole { MANAGER CASHIER BUTLER KITCHEN }
enum OrderingMode { VIEW_ONLY SELF_ORDER_APPROVAL SELF_ORDER }
enum TableStatus { FREE OCCUPIED ORDERED BILL_REQUESTED PAID CLEANING }
enum DietType { VEG NON_VEG EGG }
enum ImportStatus { VALIDATED COMMITTED FAILED }
enum OrderSource { STAFF CUSTOMER AGGREGATOR }
enum OrderStatus { PENDING_APPROVAL OPEN BILLED CANCELLED }
enum OrderItemStatus { NEW SENT PREPARING READY SERVED VOIDED }
enum BillStatus { UNPAID PARTIALLY_PAID PAID CANCELLED }
enum PaymentMode { CASH CARD UPI OTHER }
enum PaymentStatus { PENDING SUCCEEDED FAILED }
enum ConsentPurpose { TRANSACTIONAL MARKETING }
enum BellTarget { BUTLER CASHIER MANAGER }
enum BellStatus { NOTIFYING ACCEPTED DONE CANCELLED UNANSWERED }
enum AttemptOutcome { ACCEPTED DECLINED_BUSY MISSED SUPERSEDED }
enum DeclineReason { WITH_ANOTHER_TABLE IN_KITCHEN ON_BREAK OTHER }
enum PlanKind { SUBSCRIPTION LIFETIME }
enum BillingInterval { MONTHLY ANNUAL }
enum SubscriptionStatus { TRIALING ACTIVE PAST_DUE GRACE CORE_MODE CANCELLED }
enum LicenceStatus { ACTIVE AMC_DUE GRACE CORE_MODE }
```

> Claude Code: change `packages/db/prisma/schema.prisma` (with a migration) when a milestone needs new fields, and list notable divergences in the note at the top of this section.

### 6.2 Seed data
`packages/db/prisma/seed.ts` creates: plans + plan features (Section 15), one demo organization, one outlet, 2 sections, 12 tables, 1 manager, 1 cashier, 3 butlers, 1 kitchen user (PINs printed to console), a demo menu (~30 items with variants/add-ons/mixed GST), and 2 devices.

### 6.3 Staff auth (device-bound PIN)
1. Owner/manager registers a device in `/owner/devices` → gets a one-time 8-digit pairing code.
2. On the device, `/staff/pair` exchanges the code for a long-lived **device credential** (httpOnly cookie, rotatable).
3. Staff log in with a **4–6 digit PIN** on a paired device only → `StaffSession` (httpOnly cookie, ~14h). Quick switch user without re-pairing.
4. PIN rate limit: 5 attempts / 5 min per device; lockout logged.
5. Owners use Better Auth sessions; an owner on a paired device can also act as staff with full permissions.

---

## 7. API surface

Every endpoint lives in **`apps/api`** (Fastify) under `/api`. The Next.js app calls these from Server Components (server-side, forwarding cookies to `API_INTERNAL_URL`) or from the browser (same origin `/api/*`). Groups:

- `/api/auth/*` — Better Auth (Google OAuth callback, phone OTP send/verify, session)
- `/api/me` — current actor, role, permissions, outlet, entitlements
- `/api/staff/*` — authenticated staff/owner operations (orders, KOTs, bills, payments, tables, bell responses, …), one route file per module
- `/api/owner/*` — owner/manager operations (menu, floor, staff, devices, reports, billing)
- `/api/admin/*` — platform admin
- `/api/public/*` — customer page (no login; scoped by `qrToken`)
- `/api/device/*`, `/api/sync`, `/api/push/*`, `/api/webhooks/*`, `/api/export/*` — below

Notable routes:

| Route | Purpose |
|---|---|
| `GET /api/public/table/:qrToken` | Outlet + table + menu payload for the customer page (cached in Redis, busted on menu change) |
| `POST /api/public/table/:qrToken/order` | Customer self-order (entitlement + ordering mode checked) |
| `POST /api/public/table/:qrToken/bell` | Ring bell `{ target }` |
| `POST /api/public/bell/:id/cancel` · `/feedback` | Customer cancel / thumbs |
| `GET /api/public/table/:qrToken/bill` | Current bill + UPI QR payload |
| `POST /api/public/feedback` | Private rating after payment |
| `POST /api/device/pair` | Device pairing |
| `POST /api/device/invoice-block` | Allocate next invoice block |
| `POST /api/sync` | Offline sync batch (orders, KOTs, bills, payments) with idempotency keys |
| `POST /api/push/subscribe` | Save Web Push subscription |
| `POST /api/bell/:id/respond` | `{ action: ACCEPT | DECLINE | DONE, reason? }` — used from notification action buttons |
| `POST /api/webhooks/razorpay` | Payment + subscription webhooks (signature verified) |
| `POST /api/webhooks/whatsapp` | Delivery status |
| `GET /api/export/:report` | Excel exports |

All endpoints: zod-validated request **and** response schemas (shared with the web client), consistent error shape `{ error: { code, message } }`. Public endpoints are rate-limited (Redis) and never expose internal IDs beyond what's necessary. OpenAPI spec served at `/api/docs` in dev.

## 8. Real-time event catalog

Publish via `publishEvent(event)` in `apps/api/src/lib/events.ts` after a successful write; it emits straight to the Socket.io rooms (same process). With several API instances, the Socket.io Redis adapter fans events out across them; BullMQ workers publish through the same adapter.

**Rooms:** `outlet:{id}:staff`, `outlet:{id}:role:{ROLE}`, `outlet:{id}:employee:{employeeId}`, `outlet:{id}:kitchen`, `outlet:{id}:owner`, `table:{qrToken}` (customer page).

| Event | Payload (shape in `packages/shared/src/events.ts`) | Rooms |
|---|---|---|
| `table.statusChanged` | `{ tableId, status }` | staff, owner |
| `order.created` / `order.updated` | `{ orderId, tableId, items }` | staff, kitchen |
| `order.pendingApproval` | `{ orderId, tableId }` | assigned butler + manager |
| `kot.created` / `kot.itemStatusChanged` | `{ kotId, items }` | kitchen, staff |
| `bill.created` / `bill.paid` | `{ billId, tableId, total }` | staff, owner, table |
| `bell.rung` | `{ bellId, tableLabel, target, level }` | targeted employees + station devices |
| `bell.updated` | `{ bellId, status, acceptedByName? }` | staff, table |
| `menu.stockChanged` | `{ itemId, inStock }` | staff, table rooms of outlet |
| `feedback.lowRating` | `{ tableLabel, rating, comment }` | manager, owner |

Clients: `useOutletSocket()` hook that joins rooms after auth and invalidates TanStack Query keys on events. Reconnect → refetch.

## 9. Offline strategy (cashier/counter + butler devices)

- **Serwist** precaches the staff shell; menu, tables, and open orders are mirrored into **Dexie** on login and kept fresh via socket events.
- When offline: orders, KOTs (printed locally), bills (numbered from the device's `InvoiceBlock`), and payments are written to Dexie with a `clientId` (cuid) and put in an **outbox**.
- On reconnect: outbox flushes to `POST /api/sync` in order; the server upserts by `clientId` (idempotent). Server is the source of truth; conflicts (e.g. item voided by manager while offline) resolve server-side and the device re-pulls.
- Device requests a new invoice block when <50 numbers remain.
- Offline banner always visible; bell and customer self-ordering are **online-only** (state this in the UI).
- Owner dashboard and customer pages do not need offline support.

## 10. Printing

- `packages/print`: `buildReceipt(bill, outlet, width: 58|80)` and `buildKot(kot)` return ESC/POS byte arrays (text, bold, alignment, cut, QR for UPI). Snapshot-test the output.
- Drivers in `apps/web/src/features/printing/drivers/`: `webusb.ts`, `webbluetooth.ts`, `bridge.ts` (HTTP to `apps/print-bridge` on the LAN). Common interface `PrinterDriver { connect(); print(bytes); status() }`.
- Printer settings stored per device (Dexie + server): which printer for bills, which for KOT, paper width, copies.
- Fallback: browser print of the PDF.
- Supported matrix: Chrome on Android and desktop. Safari = PDF fallback only.

---

## 11. Milestones and tasks

> Effort estimates assume 2 full-stack developers using Claude Code. Total MVP ≈ 11–13 weeks.

### 11.0 Phases

Milestones are grouped into phases. Each phase ends in a **demo you can run** and an **exit gate**; don't start the next phase until the gate passes. Every UI task follows the UI workflow in `CLAUDE.md` (DESIGN.md → ui-ux-pro-max → build → taste → `/web-interface-guidelines` → playwright-cli).

| Phase | Weeks | Milestones | Demo at the end | Resolve before starting |
|---|---|---|---|---|
| **P1 Foundation** | 1–2 | M0, M1 | Owner signs up, onboards an outlet, adds staff; butler logs in with PIN on a paired device | OTP provider · service-charge GST treatment (see "Known gaps" below) |
| **P2 Menu & floor** | 2–3 | M2, M3 | Import a 30-item menu from Excel; print the QR sheet; assign butlers to tables | Final product name & domain (printed on QR cards) |
| **P3 Service core** | 3–6 | M4, M5, M6 | Butler takes an order in ≤ budget taps → KOT appears on the kitchen display and prints; customer sees live stock | Pilot printer models |
| **P4 Billing** ✅ *first usable release* | 6–7 | M7 | Cashier bills a table in 2 taps; GST-correct printed bill with UPI QR; split payment; cancel + reprint | Payment gateway account · WhatsApp BSP · legal review of bill format & consent text |
| **P5 Bell** ★ | 7–8 | M8 | Customer rings → butler A ignores → escalates to B → B accepts → customer sees B → 👍 | — |
| **P6 Offline** | 8–9 | M9 | Pull the network: order, KOT, bill, pay → reconnect → server matches, no duplicates | — |
| **P7 Insights & feedback** | 9–10 | M10, M11 | Owner opens app → today's numbers with 0 taps; staff service board; low-rating alert | — |
| **P8 Monetisation & admin** | 10–11 | M12, M13 | Trial → subscribe via Razorpay → lapse → grace → core mode (billing still works); admin override | Razorpay Subscriptions live keys |
| **P9 Pilot readiness** | 12–13 | M14 | Device matrix passed; backups restored; staging + prod deployed; pilot checklist done | Pilot restaurants signed up |
| **P10 Post-MVP** | after pilots pay | Section 16 | — | Pilot feedback |

**Exit gates (all phases):** every task in the phase meets the Section 12 definition of done · phase demo recorded as a Playwright E2E test · `pnpm check` + E2E green in CI · UI screens verified at 360px/tablet, light/dark, EN/HI.

**Checkpoint after P4:** the product can run a real restaurant online (order → kitchen → bill → pay). Consider a friendly-restaurant dogfood here, before the bell and offline work, to catch workflow problems early.

**Known gaps in phase order** (decide before the phase that hits them):
1. **Entitlements are built in M12 (P8) but needed from P3** (`CUSTOMER_SELF_ORDER` in M5-T6, `BELL_SYSTEM` in M8, `STAFF_ANALYTICS` in M10-T3). Proposal: add a stub `hasFeature()`/`getLimit()` in P1 (M1-T4) that reads the seeded plan, so call sites exist from day one and M12 only replaces the resolver. **Adopted 2026-11-16 (M1-T4).**
2. **M5-T5 (VOID KOT print) depends on M6 printing**, and **M6-T3 auto-print bill depends on M7 bills.** Proposal: do M5-T5's print part in M6, and the bill half of M6-T3 inside M7-T1.
3. **Real-time (M4) is in P3, but M2-T4 stock toggle (P2) emits `menu.stockChanged`.** Proposal: M2-T4 calls `publishEvent()` with no Socket.io attached yet (a no-op emitter); M4-T2 attaches Socket.io. **Adopted 2026-11-17 (M2-T1).**

### M0 — Foundations (week 1)
- [x] **M0-T1** Scaffold monorepo (pnpm, Turborepo), `apps/web` (Next.js, TS strict, Tailwind, shadcn/ui), `apps/server`, `packages/{db,shared,print,config}`.
- [x] **M0-T1b** Separate backend: rename `apps/server` → `apps/api` and rebuild it on **Fastify 5** (`buildApp()` factory, `server.ts` + `worker.ts` entries, zod type provider, error handler with `{ error: { code, message } }`, `GET /api/health`, OpenAPI at `/api/docs` in dev). Next.js `rewrites` `/api/*` → API in dev; remove the Next.js `/api/health` route; `API_INTERNAL_URL` for server-side fetches; typed `apiFetch()` client in `apps/web/src/lib/api.ts`.
  *Accept:* `pnpm dev` runs both; `GET http://localhost:3000/api/health` is answered by Fastify through the rewrite; Fastify route tests via `app.inject()`; `pnpm check` passes.
  *Accept:* `pnpm dev` runs web + server; `pnpm check` (= typecheck + lint + test) passes.
- [x] **M0-T2** `docker-compose.yml` with Postgres 16 and Redis; Prisma set up in `packages/db` with the Section 6 schema; first migration; seed script.
  *Accept:* `pnpm db:reset` migrates and seeds; seed prints demo PINs.
- [x] **M0-T3** Env validation (zod) in `src/env.ts` for web (public + `API_INTERNAL_URL` only) and api (all secrets); `.env.example`.
  *Accept:* app fails fast with a clear message on missing env.
- [x] **M0-T4** Testing: Vitest (unit + integration against a test DB), Playwright (one smoke test); GitHub Actions CI running `pnpm check` and Playwright.
- [x] **M0-T5** `packages/shared`: `money.ts` (paise helpers, `formatINR`), `gst.ts` (Section 5.1 calculation), zod enums mirroring Prisma enums.
  *Accept:* ≥95% coverage on `gst.ts`, including inclusive vs exclusive pricing, multi-rate bills, proportional bill discount, service charge, and round-off edge cases.
- [x] **M0-T6** Sentry wired in web and api; pino structured logging via Fastify's logger (request id on every log line).

### M1 — Tenancy, auth, roles (week 1–2)
- [x] **M1-T1** Owner login via **Google OAuth 2.0** and **mobile OTP** only (Better Auth Google provider + phone-number plugin). No email/password, no custom sign-up form: first successful login creates the user, then routes to onboarding (M1-T2). Owner can link Google and phone to one account. OTP sending behind an `OtpProvider` interface with a console adapter for dev; OTP rate-limited (Redis) and expiring.
  *Accept:* E2E: phone OTP login (console adapter) → onboarding; Google login covered by a mocked OAuth callback test; no email/password route exists.
- [x] **M1-T2** Onboarding wizard: organization → first outlet (name, address, state, GSTIN, FSSAI, tax inclusive?, invoice code). Max 3 screens.
- [x] **M1-T3** `getTenantDb(ctx)` Prisma extension + lint rule banning raw `prisma` imports in `apps/api/src/modules/**` and any `@restoos/db` import in `apps/web`.
  *Accept:* integration test proves an outlet cannot read another org's menu/bills.
- [x] **M1-T4** Permissions module (Section 5.4) with `can()` + `requirePermission()` helper for actions.
  *Accept:* table-driven test covering every role × permission.
- [x] **M1-T5** Employee management in `/owner/staff`: add/edit/deactivate, set role, set/reset PIN.
- [x] **M1-T6** Device pairing + staff PIN login (Section 6.3), quick user switch, lockout.
  *Accept:* E2E: pair device → PIN login as butler → sees butler home; wrong PIN ×5 → locked.
- [x] **M1-T7** Shifts: staff "Start shift" / "End shift" (auto-start on first login of the day, configurable). Audit log helper `audit(ctx, action, entity, id, data)`.

### M2 — Menu (week 2–3)
- [x] **M2-T1** Menu CRUD in `/owner/menu`: categories, items, variants, add-on groups, diet type, GST rate, HSN, item code, image upload (S3, resized).
- [x] **M2-T2** Downloadable Excel template (exceljs) with a header row, an example row, data validation dropdowns (diet type, GST rate 0/5/18/40 — `GST_RATES_BPS`) and an instructions sheet.
- [x] **M2-T3** Excel import: upload → parse → validate every row (zod) → **preview screen** showing new/updated/error rows with row+column messages → commit in one transaction. Upsert by item `code` when present.
  *Accept:* a file with 3 bad rows shows exactly those 3 errors and commits nothing until fixed or the owner chooses "import valid rows only".
- [x] **M2-T4** One-tap "Out of stock" toggle (owner, manager, cashier, kitchen) → emits `menu.stockChanged`.
- [x] **M2-T5** Menu payload builder for the customer page (`GET /api/public/table/:qrToken`), cached in Redis and busted on any menu change.

### M3 — Floor and tables (week 3)
- [x] **M3-T1** Sections and tables editor in `/owner/floor` (grid layout, drag to position, bulk-add "T1–T20").
- [x] **M3-T2** QR generation: printable A4 PDF sheet of table cards (outlet name, table label, QR to `/t/[qrToken]`, "Scan to view menu & call staff"). Token rotation per table.
- [x] **M3-T3** Table assignment per shift: manager screen to assign butlers to tables or whole sections (tap butler → tap tables). Default to previous day's assignment.
- [x] **M3-T4** Staff floor view: tables coloured by status, filter "My tables", badges for active bell and pending approval. Table state machine (Section 5.6) enforced in service.
  *Accept:* invalid transitions throw; unit tests cover the full state machine.

### M4 — Real-time backbone (week 3–4)
- [x] **M4-T1** Socket.io on the `apps/api` Fastify server with auth (staff session cookie / owner session / customer qrToken), room joining per Section 8; Redis adapter.
- [x] **M4-T2** `publishEvent()` in `apps/api` → Socket.io rooms (and from workers via the Redis adapter). Typed event map in `packages/shared/src/events.ts`.
- [x] **M4-T3** `useOutletSocket()` client hook with reconnection + TanStack Query invalidation.
  *Accept:* E2E: toggling stock on one browser updates the customer menu in another within 2s. *(2026-11-18: proved staff ↔ owner — kitchen stock → owner menu, owner seats → butler floor — in `e2e/live.spec.ts`; the customer-menu version moves to M5-T6, which builds that page.)*

### M5 — Ordering and kitchen (week 4–5)
- [x] **M5-T1** Staff order screen: table header, search (name/code), category tabs, top-items grid, quantity steppers, long-press for variants/add-ons/note, live running total with tax, "Send to kitchen".
  *Accept:* order of 3 simple items for a table = table tap + 3 item taps + Send. Playwright test counts clicks.
- [x] **M5-T2** KOT creation on send (only NEW items), daily KOT number, `kot.created` event.
- [ ] **M5-T3** Kitchen display `/staff/kitchen`: KOT cards in columns (New / Preparing / Ready), tap to advance, timer since created, colour when late (>15 min configurable), sound on new KOT.
- [ ] **M5-T4** Butler "Ready to serve" list and "Served" action.
- [ ] **M5-T5** Void item with reason (permission-checked, audited); voided items print a VOID KOT.
- [ ] **M5-T6** Customer menu `/t/[qrToken]`: fast mobile menu (veg filter, search, Hindi toggle), out-of-stock greyed. If ordering mode allows: cart → place order → `PENDING_APPROVAL` (butler approves with 1 tap) or direct.
- [ ] **M5-T7** Table operations: transfer table, merge tables (audited).

### M6 — Printing (week 5–6)
- [ ] **M6-T1** `packages/print` ESC/POS builder + receipt and KOT templates for 58/80mm with snapshot tests.
- [ ] **M6-T2** WebUSB and Web Bluetooth drivers + printer setup screen per device with "Print test page".
- [ ] **M6-T3** Auto-print KOT on send and bill on create (per device settings), PDF fallback.
- [ ] **M6-T4** (Optional, can slip to after pilot) `apps/print-bridge`: tiny Node app exposing `POST /print` on localhost to LAN/USB printers, with a pairing token.
  *Accept:* tested on at least 3 common printer models; results recorded in `docs/device-matrix.md`.

### M7 — Billing and payments (week 6–7)
- [ ] **M7-T1** Bill generation from a table session: computes lines via `gst.ts`, snapshots lines + tax breakup, allocates invoice number from the device block. Cashier flow: tap table → "Bill" → auto-print (**2 taps**).
- [ ] **M7-T2** Discounts (item and bill, % or ₹) with permission caps; optional service charge (removable); complimentary items (100% discount with reason).
- [ ] **M7-T3** Payments: cash (with change calculator), card, UPI, split across modes, partial payments. UPI: render dynamic UPI QR with exact amount on screen and on the printed bill.
- [ ] **M7-T4** Gateway UPI QR + Razorpay webhook to auto-mark paid (behind outlet setting; manual "Mark paid" always available).
- [ ] **M7-T5** Bill PDF (`@react-pdf/renderer`) with all mandatory fields (Section 5.1); downloadable from staff and owner screens.
- [ ] **M7-T6** Optional customer capture at billing: phone + name, consent checkbox (transactional / marketing separately), linked to `Customer`.
- [ ] **M7-T7** WhatsApp bill: provider-agnostic `MessagingProvider` interface, console adapter for dev, first real adapter; sends bill PDF link via an approved template; deducts `MessageCredit`. Queue via BullMQ.
- [ ] **M7-T8** Bill cancellation (manager+, reason, audited); reprint.
  *Accept:* integration tests: invoice numbers are unique and sequential per device block; a cancelled bill keeps its number; totals match `gst.ts` exactly.

### M8 — Bell system (week 7–8) ★ core differentiator
- [ ] **M8-T1** Web Push setup: VAPID keys, subscribe flow during staff login with a mandatory "Enable notifications" step and a **"Test bell"** button that confirms delivery end-to-end; store `PushSubscription`; prune dead endpoints.
- [ ] **M8-T2** Customer bell UI on `/t/[qrToken]`: 🔔 → Butler / Cashier / Manager → live status ("Notifying…", "Rahul is coming 🙋", "Done — was this handled? 👍👎"), cancel, cooldown, muted-table message.
- [ ] **M8-T3** Bell service + routing (Section 5.7): create `BellEvent`, resolve level-0 recipients (assigned butler / on-shift role), create `BellAttempt`s, emit `bell.rung`, send push with action buttons (Accept / Busy), schedule BullMQ timeout job.
- [ ] **M8-T4** Escalation worker in `apps/api` (`worker.ts`): on timeout → mark open attempts `MISSED` → next level recipients → new attempts → re-schedule; after last level → `UNANSWERED` + alert manager/owner.
- [ ] **M8-T5** Staff response: Accept (1 tap from notification or in-app full-screen bell alert), Busy with reason (2 taps), Done. Accepting cancels the timeout job and marks other open attempts `SUPERSEDED`. Race-safe (DB transaction + row lock).
- [ ] **M8-T6** **Station mode** for devices flagged `isStation`: full-screen bell board, loud looping sound + vibration until accepted, Screen Wake Lock, "tap to enable sound" gate on start (autoplay policy).
- [ ] **M8-T7** Manager tools: mute table 30 min, rotate table QR token, live bell board.
  *Accept:* E2E with 3 browser contexts (customer, butler A, butler B): ring → A ignores 30s → A's attempt MISSED → B notified → B accepts → customer sees B's name → B Done → customer 👍. Unit tests for every state transition; load test 50 simultaneous bells per outlet.

### M9 — Offline (week 8–9)
- [ ] **M9-T1** Serwist service worker, app shell precache, offline page, install prompt (A2HS) for staff.
- [ ] **M9-T2** Dexie stores: menu, tables, open orders, settings, outbox, invoice block.
- [ ] **M9-T3** Offline order → local KOT print; offline bill using the device block; offline payments.
- [ ] **M9-T4** `/api/sync` idempotent batch endpoint + client outbox flusher with retry/backoff; conflict handling (Section 9).
  *Accept:* Playwright with network offline: create order, print KOT (mock driver), bill, pay → go online → server has identical records, no duplicates on retry.

### M10 — Owner dashboard and reports (week 9–10)
- [ ] **M10-T1** `/owner` home = **today**: sales, bills, average bill value, covers, payment-mode split, top 5 items, live tables occupied, open bells. No clicks needed.
- [ ] **M10-T2** Sales reports with date range: by day, item, category, payment mode, staff (bills created), discounts and voids (leakage view).
- [ ] **M10-T3** **Staff service board** (entitlement `STAFF_ANALYTICS`): per employee — bells received, accepted, missed, declined (by reason), median response time, median resolution time, 👍/👎, tables served. Trend vs previous period.
- [ ] **M10-T4** Billing records: search by invoice no., phone, amount, date; view/reprint/download PDF.
- [ ] **M10-T5** Excel export for every report (exceljs).
- [ ] **M10-T6** Day-end summary: expected cash vs counted cash entry, variance logged.

### M11 — Feedback and reviews (week 10)
- [ ] **M11-T1** Post-payment customer screen: thank you, private 1–5 rating + comment, Google review button shown to **everyone**.
- [ ] **M11-T2** Low rating (≤2) → `feedback.lowRating` real-time alert + push to manager.
- [ ] **M11-T3** Feedback report in owner dashboard.

### M12 — SaaS plans, subscriptions, lifetime licence (week 10–11)
- [ ] **M12-T1** Entitlements module (Section 5.5): `hasFeature`, `getLimit`, Redis cache, `<FeatureGate feature=…>` component with an upgrade prompt.
  *Accept:* every gated feature has a test asserting it is blocked on Starter and allowed on Growth.
- [ ] **M12-T2** 14-day Growth trial on signup; trial banner with days left.
- [ ] **M12-T3** Razorpay Subscriptions (monthly/annual, UPI AutoPay + cards): checkout, webhooks (`activated`, `charged`, `halted`, `cancelled`), status mapping, failed-payment WhatsApp reminders.
- [ ] **M12-T4** Lifetime licence: one-time Razorpay order → `Licence` with `amcDueDate = +1 year`; AMC renewal checkout; reminders at 30/15/3 days (BullMQ scheduled jobs).
- [ ] **M12-T5** Grace (30 days) → **core mode** automation for subscriptions and licences (Section 5.5). Data export always allowed.
- [ ] **M12-T6** Upgrades immediate (pro-rata), downgrades at period end (`pendingPlanId`). Staff/outlet limit enforcement with clear messages.
- [ ] **M12-T7** Add-on purchases (feature add-ons, extra outlets, WhatsApp credit packs).
- [ ] **M12-T8** `/owner/billing` one-screen page: plan, renewal/AMC date, invoices, usage meters (staff count, WhatsApp credits), upgrade button.
- [ ] **M12-T9** Platform GST invoices (`PlatformInvoice`) generated on every successful charge, PDF + email/WhatsApp.

### M13 — Platform admin (week 11)
- [ ] **M13-T1** `/admin` (separate role, IP allowlist optional): organizations list, outlets, plan/licence status, manual plan override with reason, extend trial.
- [ ] **M13-T2** Audited impersonation ("view as owner") for support.
- [ ] **M13-T3** Plan & price management UI backed by `Plan` / `PlanFeature`.

### M14 — Hardening and pilot readiness (week 12–13)
- [ ] **M14-T1** Security pass: rate limits on all public routes, CSRF on actions, headers (CSP), PIN brute-force tests, webhook signature tests, dependency audit.
- [ ] **M14-T2** Performance: customer menu LCP < 2s on a mid-range Android over 4G; staff order screen interactions < 100ms; DB indexes reviewed with `EXPLAIN`.
- [ ] **M14-T3** Device test matrix (`docs/device-matrix.md`): 5+ low-end Android phones, 1 iPhone (home-screen PWA), 3 printers. Record bell delivery rate on locked screens (target ≥95% within 5s).
- [ ] **M14-T4** Backups (daily automated + restore drill), uptime monitoring, Sentry alerts, runbook in `docs/runbook.md`.
- [ ] **M14-T5** Production Docker images, Caddy config, deploy pipeline (staging + production), zero-downtime migrations policy.
- [ ] **M14-T6** Pilot onboarding kit: in-app setup checklist (menu import → floor → staff → devices → printer test → bell test → first bill).

---

## 12. Testing strategy

| Layer | Tool | What must be covered |
|---|---|---|
| Pure logic | Vitest | `gst.ts`, money, invoice numbering, table & bell state machines, entitlements resolution, permissions matrix |
| Services + DB | Vitest + test Postgres (truncate between tests) | Tenant isolation per model, idempotent sync, race on bell accept, bill totals |
| E2E | Playwright | Onboarding, menu import, order→KOT→bill→pay, bell escalation (multi-context), offline flow, click budgets, plan gating |
| Print output | Vitest snapshots | Receipt + KOT bytes for 58/80mm |
| Manual | Device matrix | Push on locked screens, printers, PWA install |

**Definition of done for every task:** acceptance criteria met · tests added · `pnpm check` green · no new `any` · server-side permission + entitlement checks in place · audit log for sensitive actions · plan checkbox ticked.

## 13. Environment variables (`.env.example`)

```
DATABASE_URL=
REDIS_URL=
APP_URL=
SOCKET_URL=
BETTER_AUTH_SECRET=
GOOGLE_CLIENT_ID=               # Google Cloud OAuth 2.0 client (web)
GOOGLE_CLIENT_SECRET=
OTP_PROVIDER=console            # console | msg91 | ...
OTP_API_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:
S3_BUCKET=
S3_REGION=ap-south-1
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
MESSAGING_PROVIDER=console      # console | <bsp>
MESSAGING_API_KEY=
SENTRY_DSN=
PLATFORM_GSTIN=
PLATFORM_LEGAL_NAME=
```

## 14. Deployment

- **Staging** and **production** on AWS Mumbai (`ap-south-1`).
- Containers: `web` (Next.js standalone output, frontend only), `api` (Fastify + Socket.io), `worker` (same `apps/api` image, `worker.ts` entry), Caddy (TLS; routes `/api/*` and `/socket.io/*` to `api`, everything else to `web`).
- Postgres: RDS with automated backups + PITR. Redis: managed or container with AOF persistence.
- Migrations run as a release step before the new `web` container takes traffic. Only backwards-compatible migrations in a single release (expand → migrate → contract).
- Sticky sessions not required (Socket.io with Redis adapter when scaling `api` horizontally).

## 15. Plans and entitlements seed

| Feature / limit | Starter | Growth | Pro | Lifetime Growth |
|---|:-:|:-:|:-:|:-:|
| `POS_CORE`, `QR_MENU`, `OFFLINE` | ✅ | ✅ | ✅ | ✅ |
| `BELL_SYSTEM` | | ✅ | ✅ | ✅ |
| `STAFF_ANALYTICS` | | ✅ | ✅ | ✅ |
| `CUSTOMER_SELF_ORDER` | | ✅ | ✅ | ✅ |
| `WHATSAPP_BILLS`, `CRM` | | ✅ | ✅ | ✅ |
| `REVIEW_FLOW_FULL` | | ✅ | ✅ | ✅ |
| `INVENTORY` | | add-on | ✅ | add-on |
| `AGGREGATORS` | | add-on | ✅ | add-on (monthly) |
| `AI_INSIGHTS` | | | ✅ | |
| `MULTI_OUTLET` | | | ✅ | |
| `MAX_STAFF` | 5 | 20 | unlimited | 20 |
| `MAX_OUTLETS` | 1 | 1 | unlimited | 1 |

| Plan | Monthly | Annual | One-time | AMC (from year 2) |
|---|---|---|---|---|
| Starter | ₹999 | ₹9,990 | — | — |
| Growth | ₹2,499 | ₹24,990 | — | — |
| Pro | ₹4,499 | ₹44,990 | — | — |
| Lifetime Growth | — | — | ₹34,999 | ₹9,999 |

Prices exclude 18% GST and are stored in the DB (paise), editable from `/admin` — never hardcoded.

## 16. Post-MVP backlog (do not build until pilots are paying)

**Phase 2:** inventory + recipe costing · CRM campaigns on WhatsApp (win-back, birthdays) · Zomato/Swiggy via an integration provider · staff performance score + incentives · attendance & salary reminders · multi-outlet dashboard · credit notes · customisable permissions · NFC table tent ordering flow · Tally export · Hindi + regional language UI for staff.

**Phase 3:** AI weekly insights + menu engineering (LLM over aggregated reports, never raw PII) · smart upsell on customer menu · peak-hour staffing suggestions from bell volume · Capacitor/TWA Android wrapper if web push reliability < target.

## 17. Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-10-21 | Web-only PWA for all roles; native wrapper deferred | One codebase; revisit if bell delivery < 95% in device matrix |
| 2026-10-21 | Next.js + PostgreSQL + Prisma | Team expertise |
| 2026-10-21 | Separate `apps/server` for Socket.io + BullMQ | Next.js route handlers unsuitable for WebSockets and timers |
| 2026-10-21 | Lifetime = one-time fee + mandatory AMC; core mode on lapse | Cloud running costs; never block billing |
| 2026-10-21 | Visual design system = `DESIGN.md`, adapted from the Airbnb analysis in awesome-design-md; own "Masala" accent (#c8361a), Inter + Noto Sans Devanagari, dark mode | Warm hospitality feel; WCAG AA contrast; avoids copying another brand's identity |
| 2026-10-23 | Owner auth = Google OAuth 2.0 + mobile OTP only; no custom sign-up/sign-in, no email/password. Staff keep device-bound PIN login (Section 6.3) | Product owner decision; fewer passwords to manage, phone-first users in India |
| 2026-10-23 | Toolchain pins: pnpm 12.15, TypeScript **6.0.x** (not 7), ESLint **9.39** (not 10), Next 16.4, Tailwind 4.3 (CSS-first; tokens in `packages/config/tailwind/theme.css`) | typescript-eslint supports TS < 6.1 only; eslint-config-next plugins safest on ESLint 9. Revisit when typescript-eslint supports TS 7 |
| 2026-10-23 | Internal packages (`@restoos/*`) ship TS source, no build step; `apps/server` runs via `tsx` (dev and start), `build` = typecheck | Simplest monorepo setup; production bundling of the server revisited in M14-T5 |
| 2026-10-23 | **Separate Node.js backend.** `apps/api` (Fastify 5) owns all server-side work: business logic, DB, auth, REST API, Socket.io, BullMQ workers, webhooks, sync. Next.js is frontend-only (no Server Actions, no DB, no API route handlers). Supersedes the 2026-10-21 `apps/server` decision. Same origin via Caddy / Next `rewrites` | Product owner decision: clean separation; one API reusable by a future native app or partners. Fastify chosen for speed, TypeScript + zod support, low boilerplate |
| 2026-11-09 | API stack: Fastify 5.12 + `fastify-type-provider-zod` 7 (zod 4.6 schemas from `packages/shared` validate requests and serialize responses), `@fastify/swagger` + UI at `/api/docs` (dev only), pino-pretty in dev. No CORS plugin (same origin). `@typescript-eslint/require-await` off (Fastify plugins are async by convention). API tests use a 15s timeout | Typed routes from one schema source; readable dev logs; parallel `pnpm check` exceeded vitest's 5s default on cold Fastify boots |
| 2026-11-10 | Prisma **7.10** (not the 8.0 RC): `prisma-client` generator → `packages/db/src/generated` (git-ignored, built by turbo `generate`), URL in `prisma.config.ts`, `@prisma/adapter-pg` driver adapter, root `.env` loaded with Node's `process.loadEnvFile()` (no dotenv). `db:reset` = reset + generate + seed (Prisma 7 no longer seeds automatically) | Stable release; Prisma 7 configuration model |
| 2026-11-10 | `organizationId` on every tenant table including child rows; top-level rows relate to `Organization`, outlet-level rows to `Outlet`, child rows to their parent; `getTenantDb` keeps `organizationId` consistent | Lets the tenant extension (M1-T3) filter any table directly without joins |
| 2026-11-10 | Local Docker ports **5434** (Postgres) and **6380** (Redis) | This machine already runs a native PostgreSQL 18 service on 5432 and another project's containers on 5433/6379 |
| 2026-11-10 | Seed uses **fixed demo PINs** (manager 1001, cashier 2001, butlers 3001–3003, kitchen 4001), stored as argon2 hashes; demo tenant created once, plans always upserted | Seed stays idempotent and can print PINs on every run. Dev data only — never seed staging/prod |
| 2026-11-10 | `pnpm check` runs turbo with `--concurrency=4` | With 16 parallel tasks the API tests were CPU-starved (27s vs 2.4s alone) |
| 2026-11-10 | Prisma blocks AI agents from destructive commands (`migrate reset`) without the user's explicit consent; Claude must ask every time | Safety guard; agreed for the M0-T2 acceptance run on the local dev DB |
| 2026-11-10 | **Env policy:** one repo-root `.env` (loaded with Node's `process.loadEnvFile()` when the file exists; real env vars win; deployed servers have no file). Validated with zod at startup by `apps/api/src/env.ts` and `apps/web/src/env.ts` via `parseEnv()` from `@restoos/shared/env` (lists every problem, never prints values). Variables are **required only once code uses them**; integration secrets stay optional (format-checked) until their milestone makes them required (e.g. `BETTER_AUTH_SECRET`/Google/OTP in M1-T1) | `pnpm dev` works without fake keys, malformed values still fail fast; secrets never leak into logs |
| 2026-11-10 | `@restoos/shared/env` is browser-safe; the `.env` file loader is a separate Node-only entry `@restoos/shared/env/node` | Web client code imports shared schemas; `node:fs` must not reach the browser bundle |
| 2026-11-10 | **Test DB:** separate `restoos_test` database (`TEST_DATABASE_URL`, must contain "test" and differ from `DATABASE_URL`). Vitest globalSetup creates it and runs `prisma migrate deploy` (never `reset`); `resetTestDb()` truncates all tables in `beforeEach`. Integration tests are `*.int.test.ts` in a serial Vitest project; `pnpm check` needs `pnpm infra:up` | Dev data never touched; no Prisma AI-consent prompts during tests; plan §12 "truncate between tests" |
| 2026-11-10 | **E2E:** `@playwright/test` with the installed Google Chrome (`channel: "chrome"`), desktop + 360px projects; locally 2 workers / 90s timeout against `next dev`, CI 4 workers against `next start` | No browser download; cold `next dev` compiles pages on first hit and timed out with many parallel workers |
| 2026-11-10 | **CI:** GitHub Actions `ci.yml` — Postgres + Redis services on the same ports as local, `pnpm check` → `pnpm build` → `pnpm test:e2e`, report uploaded on failure. Repo not on GitHub yet; runs on first push | One pipeline mirroring local commands |
| 2026-11-14 | **GST is charged on the service charge**, at the rate of the items it relates to (service charge allocated to lines by taxable value). Service charge stays optional, off by default, removable per bill | Product owner chose common practice; CA to confirm before launch (Section 18) |
| 2026-11-14 | GST engine conventions: integer paise + bps only; half-up rounding via BigInt (`mulDivRound`); proportional splits via largest remainder (`allocateBy`, exact and deterministic); tax rounded per line, CGST and SGST each on rate/2 (always equal); inclusive prices backed out so taxable + tax = price exactly; `Bill.taxableTotal` = food taxable + service charge; round-off to nearest rupee half-up (−49…+50 paise) | Exact, reproducible bills on server, browser and offline devices |
| 2026-11-14 | `@vitest/coverage-v8` gate (≥95%, currently 100%) on `gst.ts`/`money.ts` in `@restoos/shared`'s test script; `fast-check` property tests (thousands of random bills per run); zod enums in `@restoos/shared` with a drift test against Prisma enums | Acceptance criterion M0-T5; catches rounding/allocation bugs examples miss |
| 2026-11-15 | API tests use a 60s timeout (first cold Fastify boot measured up to ~24s under full parallel `pnpm check`) | Avoid false failures from CPU contention; real hangs still fail |
| 2026-11-16 | **Graphify** (`graphifyy` 0.9.x from PyPI → official Graphify-Labs repo, Apache-2.0) as a dev aid: **code-only** knowledge graph (tree-sitter AST, no LLM tokens), docs/skills excluded via `.graphifyignore`, rebuilt by git post-commit/checkout/merge/rewrite hooks, output `graphify-out/` git-ignored (each machine builds its own). Not `graphify claude install` (would rewrite CLAUDE.md + add a PreToolUse hook). Docs may be added later if worthwhile | Codebase will grow large; keeping the graph current from day one costs nothing and gives impact/path queries for cross-module changes |
| 2026-11-16 | **Error tracking:** Sentry v11 (`@sentry/node`, `@sentry/nextjs`), errors only (`tracesSampleRate: 0`), **off unless a DSN is set**. API reports explicitly from our error handler (5xx only, tagged with `requestId`) plus `unhandledRejection`/`uncaughtException`, instead of Sentry's auto Fastify instrumentation (needs `node --import`, lists Fastify 3/4 only). Privacy: `dataCollection` off for user info, cookies, headers, bodies, query strings. **Both SDKs load lazily** only when a DSN is set: `@sentry/node` import measured 1–4 s warm / ~54 s cold on Windows; in the browser it kept the SDK out of every client chunk (menu LCP). No `withSentryConfig`/source-map upload until M14 (needs a Sentry org + auth token) | Pilot-ready crash visibility without slowing dev/tests/customers or leaking personal data |
| 2026-11-16 | **Logging:** pino via Fastify with `loggerOptions(env)` (`service`, `env` base fields; JSON in prod, pretty in dev). Request id: reuse a well-formed incoming `x-request-id` else UUID, logged as `requestId` on every request line (Fastify `LogController`), echoed in the `x-request-id` response header. Redaction: auth/cookie/device-secret headers, set-cookie, and `pin/otp/password/token/secret/pinHash/tokenHash` at top level and two levels deep (pino `*.key` only matches one level — a test caught top-level PINs leaking) | One id ties a user report, log lines and Sentry together; DPDP-safe logs |
| 2026-11-16 | `app/global-error.tsx`: last-resort crash screen (Title Case English for now → i18n later), shows Next's error digest as a support reference | Users get a recovery path instead of a blank page |
| 2026-11-16 | Playwright local `expect` timeout 15 s (CI 5 s) | Client navigation under cold `next dev` + parallel workers exceeded 5 s; CI tests the production build |
| 2026-11-16 | **Owner auth wiring:** Better Auth 1.7 in `apps/api` (`/api/auth/*` via a Fastify↔Fetch bridge), `@better-auth/prisma-adapter` (tables `auth_user/session/account/verification`), Redis as secondary storage (OTPs + rate limits; sessions stay in Postgres, 30-day owner sessions). Google provider only when `GOOGLE_CLIENT_*` are set (login page hides it otherwise). All password routes in `disabledPaths` (tests assert 404) | Rule 11; no account needed for local dev |
| 2026-11-16 | **Phone OTP rules:** India-only numbers (`+91[6-9]XXXXXXXXX`); 6 digits, 5-minute expiry, 3 attempts; per-phone throttle 1 send/30 s and 5/hour (Redis) + per-IP 10 sends/min, 20 verifies/min (moderate because Indian carriers share IPs via CGNAT). Phone-only owners get a placeholder email on the reserved `.invalid` domain (never deliverable). Account linking with `allowDifferentEmails` so phone ↔ Google can be joined | SMS cost + abuse protection without blocking real owners |
| 2026-11-16 | `OtpProvider` interface; console adapter for dev/tests (logs code, keeps last code in memory). **Dev-only** `GET /api/dev/last-otp` for E2E, registered only when `NODE_ENV≠production` and the console provider is active; env validation **rejects** `OTP_PROVIDER=console`, the dev `BETTER_AUTH_SECRET`, a missing Google client and a non-https `APP_URL` in production | Testable OTP login without weakening production |
| 2026-11-16 | `server.ts` validates env, then dynamically imports `main.ts` (heavy deps) | ES imports run before code; fail-fast must not wait for Better Auth/Prisma to load (spawned test timed out otherwise) |
| 2026-11-16 | **Separate test DB per package** (`restoos_test` for db, `restoos_test_api` for api) via `prepareTestDatabase(suffix)` / `createTestDb(suffix)`; API tests use Redis logical db 1 | Turbo runs packages in parallel and every suite TRUNCATEs all tables — a shared DB made them block each other (hang) |
| 2026-11-16 | **E2E always tests a production build** (`next build && next start`) on dedicated ports web 3100 / API 4100, locally and in CI | Cold `next dev` compiles routes on demand + hot reload aborted navigations; separate ports never reuse/disturb `pnpm dev` |
| 2026-11-16 | Web: `better-auth/react` client (same-origin, no secrets); `(owner)` layout guard via `GET /api/me` (server-side, forwarding cookies; `server-only` helper); full page load after sign-in/out | Frontend-only web (rule 2); nothing cached across an auth change |
| 2026-11-16 | **Invoice number format** `A1-2627-D1000045` (outlet 2 · FY 4 · device 2 · seq 6 = 16 chars, the GST maximum) | Resolves the "invoice-number format limits" gap; 999,999 bills per device per FY is ample |
| 2026-11-16 | **Onboarding (M1-T2):** one 3-step form, single `POST /api/onboarding` at the end (org → owner → outlet in one transaction; 409 `ALREADY_ONBOARDED`, unique `authUserId` guards double-submit). Service in `apps/api/src/lib/onboarding.ts` (pre-tenant, like `identity.ts`) | Nothing half-saved; no TenantContext exists before the tenant is created |
| 2026-11-16 | **GSTIN validated by format + checksum**, and the outlet GSTIN's first two digits must equal the outlet state code (official GST state list incl. 97 = Other Territory). Business GSTIN optional; FSSAI (14 digits) **optional at onboarding**, required on bills before go-live (enforced in M7) | Catch typos early without blocking unregistered/new restaurants from trying the app |
| 2026-11-16 | No trial/plan created at onboarding yet — added by M12-T2 | Entitlements arrive with plans |
| 2026-11-16 | **Tenant isolation (M1-T3):** `MODEL_SCOPE` in `packages/db/src/tenancy.ts` classifies every model (organization-root / organization / outlet / outlet-optional / global / auth), typed over `Prisma.ModelName` so an unclassified new model fails to compile; a unit test checks it against `schema.prisma`. `getTenantDb(ctx)` (apps/api `lib/tenant.ts`) is a query extension: scopes every where (unique ops via `AND`), fills `organizationId`/`outletId` on create, rejects another org/outlet (`TenantViolationError`), blocks auth tables and raw SQL, makes plans read-only | Isolation can't depend on every query remembering a filter |
| 2026-11-16 | `getTenantDb` is a factory over the app's client (`createTenantDbFactory(prisma)`), not a module singleton; pre-tenant code (`/me`, onboarding) gets bound `lib/` services from `app.ts`. Modules never see the raw client | Testable with per-package test DBs; lint can ban the client outright in `src/modules/**` |
| 2026-11-16 | Known limits of the extension: **nested writes are not rewritten** (child rows set `organizationId`, which is required) and **foreign-key ids are not checked** — services load referenced rows through the tenant client first (another tenant's row = not found) | Keeps the extension small and predictable; covered by per-model leak tests (§5.3) |
| 2026-11-16 | Lint: `no-restricted-imports` (also catches `import type`) bans `PrismaClient`/`createPrismaClient`, `@restoos/db/testing`, `@prisma/*` and generated client paths in `apps/api/src/modules/**` (tests exempt), and `@restoos/db`, `@prisma/*`, `pg`, `ioredis`, auth adapters anywhere in `apps/web`. Rules live in `packages/config/eslint/restrictions.js`, with a test that they fire | Rules 2 and 3 enforced by tooling, not review |
| 2026-11-16 | **Org `ADMIN` role** = every Owner permission except `billing.manageSubscription` (co-owner/partner) | §5.4 table had no ADMIN column; the schema already had the role |
| 2026-11-16 | Permissions are shared constants (`packages/shared/src/permissions.ts`: `PERMISSIONS`, `ROLE_PERMISSIONS`); `can(actor, permission, resource?)` in `apps/api/src/lib/permissions.ts` adds resource rules (cashier discount ≤ `outlet.maxCashierDiscountBps`); system actor may do anything. `/api/me` returns the owner's `permissions` | One source for API enforcement and UI hiding |
| 2026-11-16 | **Request context:** `resolveTenant` preHandler (`plugins/tenant.ts`) turns the owner session into `request.tenant`; owners pick an outlet with the `x-outlet-id` header (checked against their org → 403 `OUTLET_FORBIDDEN`); no OwnerAccount → 403 `ONBOARDING_REQUIRED`. Routes chain `[resolveTenant, requirePermission(p), requireFeature(f)]` (403 `FORBIDDEN` / `FEATURE_NOT_IN_PLAN`). Modules receive these via `buildModuleDeps()` | Staff device sessions plug into the same resolver in M1-T6 |
| 2026-11-16 | **Entitlement stub** (`lib/entitlements.ts`): outlet's non-cancelled subscription → plan, else licence → plan, else **Growth** until M12-T1/T2; `CORE_MODE` keeps limits but turns paid features off; `POS_CORE`/`OFFLINE` always on (rule 5); unlimited = `Infinity`; no cache yet. Feature/limit keys moved to `packages/shared/src/entitlements.ts`; `seedPlans()` exported from `@restoos/db/testing` | Call sites exist from P1; M12 only replaces resolution + adds the Redis cache |
| 2026-11-16 | **Staff sign-in = tap your name, then PIN** (M1-T6), so PINs needn't be unique per outlet. PINs are 4–6 digits; all-same-digit and straight runs (1111, 1234, 4321, 123456) are rejected; the form suggests a random strong 4-digit PIN (CSPRNG) the owner can overwrite; the PIN is shown once after saving, stored as argon2, never returned | Faster + safer than PIN-only login; no "PIN taken" errors |
| 2026-11-16 | **Managers manage only cashiers, butlers and kitchen staff**; only Owner/Admin add, edit, promote to or reset a Manager (403 `FORBIDDEN`) | A manager can't give themselves a peer or lock out another manager |
| 2026-11-16 | Deactivating a staff member or resetting their PIN **deletes their StaffSessions** (signed out on every device). Staff are never deleted (history stays) | Lost/compromised PINs take effect immediately |
| 2026-11-16 | `MAX_STAFF` counts **active** staff per outlet; enforced on add and reactivate (403 `STAFF_LIMIT_REACHED`). Concurrent adds can overshoot by one — acceptable until M12-T6 limit enforcement | Plan §15 limits are per outlet |
| 2026-11-16 | Owner screens are online-only, so their writes don't carry a `clientId` (rule 8 applies to offline-capable staff writes). Staff changes aren't in rule 7's audit list; `audit()` arrives in M1-T7 | Scope rule 8 to what can actually be offline |
| 2026-11-16 | Web: **TanStack Query** added (`@tanstack/react-query` 5.107.1, `QueryProvider` in the `(owner)` layout); Server Components pass first-render data as `initialData`. API: `@node-rs/argon2` added to `apps/api` (same version as the seed). Services throw `AppError(status, code, message)` (`lib/errors.ts`), rendered by the global error handler | Declared stack; one error path for business rules |
| 2026-11-16 | Owner outlet selection on web: `?outlet=<id>` if it's one of the owner's outlets, else the first; sent to the API as `x-outlet-id`. A real switcher comes with `MULTI_OUTLET` | Most restaurants have one outlet |
| 2026-11-16 | **Device pairing:** the owner/manager registers a device (`/owner/devices`, permission `staff.manage` — §5.4 has no device permission) and gets a one-time **8-digit code, valid 10 min**, stored only in Redis as SHA-256 (`pair:code:*`); a new code revokes the previous one; `/api/device/pair` is limited to 10 tries/min per IP. Redeeming sets the `restoos_device` cookie (`<deviceId>.<secret>`, httpOnly, SameSite=Lax, Secure on https, 1 year); only SHA-256(secret) is stored (`Device.deviceSecretHash`), rotated on every pairing so a device works in one browser only. Unpair stores an unusable hash and ends the device's sessions; devices are never deleted (bills reference them). Device invoice codes are allocated D1…D9, E1…, per outlet | Plan §6.3; high-entropy secrets need no slow hash |
| 2026-11-16 | **Staff sessions:** name tile + PIN (argon2 verify) → `StaffSession` token cookie `restoos_staff` (SHA-256 stored), **14 h**, valid only together with the same device's cookie. `resolveTenant` accepts it when there's no owner session (outlet = the device's outlet). "Switch User" ends the session; the device stays paired. `Employee.pinLength` (migration `employee_pin_length`) lets the pad sign in on the last digit (1 tap + PIN) | Quick shared-counter switching within the click budget |
| 2026-11-16 | **PIN lockout per device:** 5 wrong PINs in 5 minutes → 429 `PIN_LOCKED` with `retryAfterSeconds` (Redis counter); a wrong employee id counts as a wrong PIN; success clears the counter; lockouts are logged (`staff.pin_locked`) until `audit()` lands in M1-T7 | Plan §6.3 #4 |
| 2026-11-16 | Deferred to M4: an owner on a paired device acting as staff (§6.3 #5) — needs a UI switch on the first staff feature screens | Not needed until staff screens exist |
| 2026-11-16 | `@fastify/cookie` 11.1.5 added to `apps/api` (cookie parsing/setting for device + staff sessions); `AppError` carries optional client-safe `details` | Official Fastify plugin; lock countdowns need data |
| 2026-11-17 | **Next.js 16.4.2 → 16.4.6** (and `eslint-config-next`): moderate advisory for 16.3.0–16.4.4 (information disclosure via `'use cache'` + `unstable_cache()`); RestoOS uses neither, but `next build` refuses affected versions. Remaining audit item: `minimatch` <11.0.1 (moderate ReDoS) inside the ESLint toolchain only — lint-time, not shipped; revisit when eslint-config-next updates its resolver | Keep production builds unblocked and patched |
| 2026-11-17 | **Shifts:** one open shift per person; `Outlet.autoStartShift` (default **on**, migration `outlet_auto_start_shift`) starts it on the first PIN sign-in of the day in the outlet's timezone; otherwise staff tap **Start Shift** (idempotent). **End Shift** closes it **and signs out**; **Switch User** signs out but keeps the shift (hand-over mid-shift). A shift left open from an earlier day is **auto-closed at start + 14 h** (or now if sooner) and audited as `shift.autoClosed`. `ensureShift` runs Serializable (retry once) so concurrent sign-ins open one shift; an auto-start failure never blocks sign-in | Bell routing (M8) and table assignment (M3) need "who's on duty" |
| 2026-11-17 | **`audit()`** (`apps/api/src/lib/audit.ts`): `audit(ctx, action, entity, id, data)` via `createAudit(getTenantDb)`, or `writeAudit(tx, ctx, …)` inside a transaction. Actions are a closed list (`packages/shared/src/audit.ts`). Actor = OWNER/EMPLOYEE/SYSTEM from `ctx`. **AuditLog is append-only, enforced by the tenant client** (update/upsert/delete → `TenantViolationError`). Audited now: shift start/end/auto-close, PIN lockout, PIN reset, staff (de/re)activation and role change, device pair/unpair, outlet settings (before/after) | Rule 7 ready before the first sensitive business action (M5) |
| 2026-11-17 | Outlet settings API `GET/PATCH /api/owner/outlet/settings` (today: `autoStartShift`), guarded by `staff.manage` until a general settings permission exists; toggle lives on `/owner/staff` | Smallest place that fits; a full settings screen comes later |
| 2026-11-17 | **GST rates an item may carry: 0, 5, 18, 40 %** (`GST_RATES_BPS`, the Sept 2025 slabs; 12 % and 28 % dropped). Default 5 % (restaurant food), default SAC 996331. One constant validates the editor, API, seed and (M2-T2) Excel template | Current law; CA confirms per item (§18) |
| 2026-11-17 | **File storage:** `FileStorage` interface (`apps/api/src/lib/storage.ts`); `STORAGE_DRIVER=local` writes under `STORAGE_DIR` (default `<repo>/.data/uploads`, gitignored) and serves `GET /api/files/*` (immutable cache, safe keys only); `s3` is validated (bucket + keys) but fails fast until the bucket exists; production rejects `local` | No AWS account yet; S3 adapter lands with the bucket |
| 2026-11-17 | **Menu photos:** `@fastify/multipart` 10.1.8 + `sharp` 0.35.5 (new deps). JPG/PNG/WebP ≤ 5 MB → auto-rotated, fit 800×800, WebP q80, metadata stripped; new random key per upload (cache-safe), old file deleted on replace/remove. `@fastify/multipart` pinned one release back: 10.1.9 was a day old and pnpm's minimum-release-age guard was left on | Small fast images; keep supply-chain guard |
| 2026-11-17 | **Menu editing rules:** categories and items are **hidden, never deleted** (orders/bills reference items); add-on groups may be deleted (order lines snapshot add-ons). Item edits replace sizes/add-on links only when sent; with sizes, `basePrice` = the smallest size price ("from ₹…"). Item `code` unique per outlet → 409 `CODE_TAKEN` | History stays intact |
| 2026-11-17 | **`publishEvent()` adopted (closes §17 proposal #3):** typed event map `packages/shared/src/events.ts`; one `EventBus` per app (`app.events`), routes publish after writes (`menu.changed` now); no subscribers until the M2-T5 cache and M4 Socket.io; listener errors are logged, never thrown into the write | Call sites correct from day one |
| 2026-11-17 | Zod 4 note: `.partial()` keeps field defaults, so update schemas are built from default-free fields (an omitted field must mean "unchanged") | Caught by a test: an edit wiped item sizes |
| 2026-11-17 | **Excel menu contract** in `packages/shared/src/menu-import.ts` (columns, examples, `parseSizes`/`formatSizes`), shared by the template/export (M2-T2) and importer (M2-T3). Columns: Category, Category (Hindi), Item Name, Item Name (Hindi), Item Code, Type, Price (₹), Sizes (`Half=140, Full=220`), GST %, HSN/SAC, Description, Show on Menu. Dropdowns for Type / GST % / Show on Menu come from a hidden "Lists" sheet; price has a decimal > 0 check; codes/HSN are text cells (leading zeros kept). **Photos and add-ons stay in the app** | One definition, so the file we hand out and the importer can't disagree |
| 2026-11-17 | `GET /api/owner/menu/template.xlsx` (examples) and **`/export.xlsx` (current menu, codes included)** so owners can edit in Excel and re-import (upsert by code, M2-T3). `resolveTenant` accepts `?outletId=` as well as `x-outlet-id` (download links can't send headers); same org check | Edit-in-Excel round trip for price updates |
| 2026-11-17 | `exceljs` 4.4.0 in `apps/api` (declared stack choice). Its typings miss `worksheet.dataValidations.add` (augmented locally) and type `xlsx.load` for an old Buffer (`readWorkbook()` passes an ArrayBuffer) | Library gaps, not behaviour changes |
| 2026-11-17 | **Excel import flow:** upload (`POST /api/owner/menu/import`, .xlsx ≤ 5 MB, ≤ 1000 rows) stores the file privately (`imports/…`, never served by `/api/files`) + a `MenuImport` row and returns a preview; **nothing changes until commit**. Commit re-reads the file and **re-validates against the menu as it is now**, then writes in **one transaction** (60 s). `all` refuses while any row has a problem (400 `IMPORT_HAS_ERRORS`); `validOnly` skips them; a committed import can't run twice (409) | Acceptance: 3 bad rows → exactly 3 errors, nothing saved until fixed or "valid rows only" |
| 2026-11-17 | **Import matching:** Item Code first (may rename / move category); otherwise Category + Item Name (case-insensitive), so menus without codes don't duplicate. A code that names one item while the category+name name another → row error (no silent rename onto a duplicate). In-file duplicate codes or names → error on every copy. Rows are New / Update (with the changed fields) / No change / Problem | Safe re-imports of the exported menu |
| 2026-11-17 | **Import values:** headers in any order/case (extras ignored; missing required → file error); Type accepts veg / non-veg / non veg / egg; GST accepts 5, "5%" or a %-formatted 0.05; prices via `parseRupees`, sizes via `parseSizes`; blank HSN stays blank. Updates replace sizes from the sheet but **keep photos and add-ons**; new items append to their category; new categories are created only if a written row needs them | Lenient on format, strict on meaning |
| 2026-11-18 | **Stock toggle:** `GET /api/staff/menu/stock` (visible items of visible categories) and `PUT /api/staff/menu/items/:id/stock { inStock }` (idempotent) under `menu.toggleStock` (owner, admin, manager, cashier, kitchen — not butler); staff use their device session, owners send the outlet. Publishes `menu.stockChanged` + `menu.changed`. Not audited (not in rule 7's list) and not offline-queued (§9's offline set is orders/KOT/bills/payments), so no `clientId` | One tap from the kitchen; customer menu (M5-T6) greys it out |
| 2026-11-18 | Staff UI: `/staff/stock` (search, All / Out of Stock filter, 56px switches, optimistic with rollback) linked as "Item Stock" on the staff home (2 taps from home, 1 per dish). Owner: a switch beside each `/owner/menu` row (outside the edit button) + "Out of stock" pill | Click budget; no nested interactive elements |
| 2026-11-18 | **Customer menu payload** (`GET /api/public/table/:qrToken`, no login, `publicMenuSchema` shared with M5-T6): outlet (name, ordering mode, prices-include-tax, Google review link), table label, visible categories/items (out-of-stock kept with `inStock: false`; price = smallest size), and only the add-on groups in use. No codes, HSN, GST rates or internal flags. Token format checked before the DB; unknown → 404 `TABLE_NOT_FOUND`; table lookup uncached (rotated tokens die at once); `Cache-Control: no-store`; public rate limits come with M14-T1 | Busiest endpoint; must be fast and never stale |
| 2026-11-18 | **Redis cache, version-safe:** `pubmenu:{outlet}:ver` + `pubmenu:{outlet}:{ver}` (1 h TTL). Readers store under the version read *before* building; a bust `INCR`s the version, so a slow read can't re-cache a stale menu. Busted by `menu.changed`, `menu.stockChanged` and new **`outlet.settingsChanged`**. **Redis down → build from the database** (logged), never an error | Stock changes must show immediately; cache must never take the menu down |
| 2026-11-18 | **`publishEvent()` is now awaited** (returns a promise that always resolves; listener errors are logged): responses go out only after caches are busted, so a reader right after a change never sees the old menu | Closes a race between the stock toggle and the next menu read |
| 2026-11-18 | **Floor grid model (M3-T1):** a section is a grid of cells, 8 columns wide in the editor (`posX` 0–19, `posY` 0–49 allowed by the API); one table per cell per section (`CELL_TAKEN`). New tables auto-fill the first free cells row by row (`SECTION_FULL` past the limit). Dragging onto a taken cell swaps the two; moves are drafted and saved together via `PUT /api/owner/floor/layout` (one transaction, final state validated). Keyboard arrows and on-screen arrow buttons do the same as dragging | Matches the real room roughly without a free-form canvas; dragging is never the only way to move a table |
| 2026-11-18 | **Table labels:** 1–8 characters A–Z, 0–9 and `-`, stored upper-case, unique per outlet (`LABEL_TAKEN`). Bulk add = prefix (≤ 5 letters) + number range (≤ 100 tables, zero-padded when `from` has a leading zero, e.g. A01–A12) and is **all-or-nothing**: any taken label → 409 `LABELS_TAKEN` listing them | Predictable; no half-created ranges |
| 2026-11-18 | **Floor delete rules:** a section can be deleted only when empty (`SECTION_NOT_EMPTY`); a table only if it has no sessions or bell events (`TABLE_IN_USE`, "rename it instead") — its staff assignments go with it. Each new table gets a random 16-byte base64url `qrToken`; printing and rotation are M3-T2. Floor writes publish `floor.changed { outletId }` for M4 staff screens. Permission `floor.edit` | Keeps order history intact; QR links unguessable |
| 2026-11-18 | **QR table cards (M3-T2):** `GET /api/owner/floor/qr-cards.pdf` (all tables, `?sectionId=` or `?tableId=`; `floor.edit`) renders an A4 PDF in `apps/api` with `@react-pdf/renderer` 4.9.0: 2 × 3 cards per page, dashed cut lines; outlet name, big table label, QR, "Scan to view menu & call staff", footer host · "Powered by RestoOS". QR via `qrcode` 1.5.4 drawn as one vector path, error correction M, encoding `{APP_URL}/t/{qrToken}`. Built-in Helvetica (no font files). New API deps: `@react-pdf/renderer`, `qrcode`, `react` (react-pdf peer; built with `createElement`, no JSX config) | Plan §2 stack; vector QR prints sharp at any size; domain is just `APP_URL` |
| 2026-11-18 | **Placeholder brand:** `BRAND.name = "RestoOS"` in `packages/shared/src/brand.ts`, printed on QR cards; replace when the final product name/domain is chosen (open item below stays open). **Cards are English-only for now** — react-pdf can't shape Devanagari reliably and the i18n helper isn't in yet; add a Hindi line with the i18n work | Product owner: "use a placeholder for now" |
| 2026-11-18 | **QR rotation:** `POST /api/owner/floor/tables/:id/rotate-qr` (`floor.edit`) sets a new random token and writes audit `table.rotateQr` in the same transaction; the old link 404s at once (public table lookup is uncached); publishes `floor.changed`. Owner table sheet shows the guest link, "Download Card", and "Get New QR Code" behind a confirm. M8-T7 reuses it for managers | A copied or misused card can be killed instantly |
| 2026-11-18 | **Table assignment model (M3-T3):** a `TableAssignment` belongs to the butler's open shift; it is **active** while its `endedAt` is null **and** the shift is open, so End Shift / the 14 h auto-close drop it with no extra hooks. Only active **BUTLER**-role staff **on shift** can be given tables (`NOT_A_BUTLER`, `NOT_ON_SHIFT`). **One butler per table**: giving it to someone else moves it (the old row gets `endedAt`, kept as history); tapping it again with the same butler selected takes it off. Permission `table.assign` (owner/admin/manager), not audited (not a rule-7 action); writes publish `assignment.changed` | Unambiguous level-0 bell routing (M8); no migration needed |
| 2026-11-18 | **"Default to previous day's assignment":** when a butler's shift starts, the tables they still held when their last shift ended are copied to the new shift, skipping deleted tables and ones another on-shift butler holds (`copyPlan` in `packages/shared`); best effort — a failure is logged and never blocks sign-in. Off-shift butlers show as "Not on shift (usually T1, T2)". Board: `GET /api/staff/assignments`, `PUT …/tables/:id {employeeId|null}`, `PUT …/sections/:id {employeeId}`; UI at `/staff/assign` (manager tablet) and `/owner/floor/assign` (owner, same component), one tap per table, optimistic | Matches how restaurants actually run: same stations most days, manager only fixes the exceptions |
| 2026-11-18 | **Table state machine (M3-T4):** `packages/shared/src/table-state.ts` holds the §5.6 rules as data (`nextTableStatus`, `allowedEvents`, `sessionEffect`): seat FREE→OCCUPIED; order FREE/OCCUPIED/ORDERED/BILL_REQUESTED→ORDERED; requestBill ORDERED→BILL_REQUESTED; pay BILL_REQUESTED→PAID; clear PAID→CLEANING; cleaned CLEANING→FREE; **plus `unseat` OCCUPIED→FREE** ("Guests Left" before ordering — otherwise a table is stuck). A session opens on seat/order from FREE and closes on pay/unseat. Unit tests cover every status × event | One place for the rules; API and screens can't drift |
| 2026-11-18 | **`transitionTable()` (`apps/api/src/lib/tables.ts`) is the only way a table changes status** — staff taps now, orders (M5), bills/payments (M7) later. One transaction, conditional update on the status it read (a double tap → 409 `TABLE_CHANGED`), invalid → 409 `INVALID_TABLE_TRANSITION` with a readable reason; publishes `table.statusChanged`. Staff can only send the manual events (`seat`, `unseat`, `clear`, `cleaned`) via `POST /api/staff/tables/:id/status`; `GET /api/staff/floor` adds butler, `mine`, `activeBell` (bell NOTIFYING/ACCEPTED), `pendingApproval` (PENDING_APPROVAL order on the open session), `since`. Permission `order.create` (kitchen excluded) | Enforced in the service, per the acceptance criteria |
| 2026-11-18 | **Staff floor screen polls** every 20 s and on focus (plus a Refresh button) until M4 sockets push `table.statusChanged`/`assignment.changed`; remove the interval in M4-T3. Statuses use the DESIGN.md table palette with a status word on each tile (never colour alone); a ringing bell pulses (static under reduced motion). The `(staff)` route group now has its own `QueryProvider` layout (the M3-T3 manager board needed it too) | Usable now without real-time; no stale-forever screens |
| 2026-11-18 | **Socket.io (M4-T1):** `socket.io` 4.8.4 attached to the Fastify HTTP server in `buildApp` (`app.io`), path **`/api/socket.io` without a trailing slash** (`addTrailingSlash: false` on server and clients — Next.js 308-redirects the slash away; verified websocket + polling through the Next dev proxy), same origin so no CORS; `serveClient: false`, 16 KB max message; **server → client only** for now. Redis adapter `@socket.io/redis-adapter` 8.3.0 on two dedicated connections (errors logged; local delivery keeps working without Redis). Test-only dev dep `socket.io-client` 4.8.4 | Plan §2/§8 stack; one origin for cookies |
| 2026-11-18 | **Socket handshake = the HTTP auth rules:** `createActorResolver` (plugins/tenant.ts) is shared by `resolveTenant` and the socket middleware. Staff (device + PIN cookies) → `outlet:{o}:staff`, `…:role:{ROLE}`, `…:employee:{id}` (+ `…:kitchen`); owner session + `auth.outletId` (checked against their org) → `outlet:{o}:owner`; customer `auth.qrToken` (format-checked, uncached lookup) → `table:{qrToken}` only. Refusals are `connect_error` with `data.code` (`UNAUTHENTICATED`, `OUTLET_REQUIRED`, `OUTLET_FORBIDDEN`, `TABLE_NOT_FOUND`). Room names live in `socket/rooms.ts`. Identity is checked on every (re)connect; **kicking live sockets on sign-out / QR rotation is M4-T2** | No second copy of auth rules; tenant isolation at the room level |
| 2026-11-18 | **Event → room routing (M4-T2):** `apps/api/src/socket/routing.ts` `EVENT_ROUTES`, typed over the shared event map (an event without routing doesn't compile; `OUTLET_EVENT_NAMES` + `ServerToClientEvents` in `packages/shared/src/events.ts` type the client too). Menu / stock / settings → staff, owner, customers; floor / assignment / table status → staff, owner. One listener on `app.events` emits after every write; an emit error is logged, never fails the write. **Customers also join `outlet:{o}:public`** (deviation from §8's "table rooms of outlet": one emit instead of looking up every table token); `table:{token}` stays for bill/bell events | Nothing silently dropped or over-broadcast |
| 2026-11-18 | **Workers publish via `@socket.io/redis-emitter` 5.1.0** (`createWorkerEventBus(redis)` in `socket/emitter.ts`: same `publishEvent` signature and routing table, delivered through the API's Redis adapter); first used by M8-T4. **Live cut-off:** `ModuleDeps.realtime.disconnect(rooms)` (late-bound to `app.io`) after End Shift / Switch User / deactivate / PIN reset (that employee's room) and QR rotation / table delete (that table's room). Cut-off clients reconnect with fresh credentials or are refused by the handshake | Sign-out and rotated QR take effect immediately |
| 2026-11-18 | **Live screens (M4-T3):** `socket.io-client` 4.8.4 in the web. `features/realtime/socket.ts` keeps **one shared socket per tab and identity** (staff device, or owner + outlet), reference-counted, closed with the last screen; `useOutletSocket({ outletId? })` returns `live / connecting / offline`. Events mark TanStack Query data stale through **one typed map** (`EVENT_QUERY_PREFIXES`, prefix keys like `["menu"]`); **any reconnect refetches every live prefix**; after a server cut-off it retries once, and a handshake refusal leaves it offline (no loop); a tab becoming visible reconnects at once. Used by the staff floor, stock board, assign board, owner menu, floor editor, assign board. **Staff floor polling removed** (focus refetch + Refresh stay; a Live/Reconnecting/Offline indicator shows); the stock board now uses `useQuery(["stock", …])` | Changes reach other devices within ~1 s; no stale screens after drops |
| 2026-11-18 | **M4-T3 acceptance proved staff ↔ owner** (user decision): the customer menu page is M5-T6, which adds the "stock toggle updates the customer menu within 2 s" E2E | No customer-facing text before the i18n helper |
| 2026-11-18 | **Order screen entry (M5-T1, user-approved):** tapping a Free / Seated / Ordered / Bill table on the staff floor opens `/staff/tables/[id]` (the order screen) directly — the click budget is table + items + Send (E2E counts **5 taps** for 3 items). Seat Only / Guests Left moved to the order screen header; Paid / Cleaning tables keep the M3-T4 sheet. **The first send on a Free table seats it** (`order` FREE → ORDERED via `applyTableTransition`, in the same transaction as the order) | Meets the §1 click budget; never an ordered table without an order |
| 2026-11-18 | **Sending an order:** `POST /api/staff/orders` re-prices every line on the server (size or base price + add-ons; client prices ignored), validates sizes and add-on min/max with the shared `selectionError`, refuses inactive / out-of-stock dishes (409 `ITEMS_UNAVAILABLE` with the list), and snapshots name ("Paneer Tikka (Full)"), unit price, tax rate and add-ons onto `OrderItem` (`NEW`). **One Order per send** (M5-T2 makes it a KOT). Idempotent on `clientId` (the same send → 200 with the same order; a reused id for another table → 409); the web keeps one id per cart content, so a retry never duplicates. Publishes `order.created` → staff + kitchen. The running total on screen uses `orderTotals` → `calculateBill`, the bill's own GST maths. Popular = the 12 most-ordered dishes in 30 days, topped up from the menu | Rule 1/8/10; prices can't be tampered with |
| 2026-11-19 | **KOT per send (M5-T2):** `lib/kots.ts` `createKotForOrder(tx, ctx, orderId)` takes the order's `NEW` items without a KOT, creates one KOT (station `KITCHEN`) and marks them `SENT` — **inside the same transaction** as the order and table change (all or nothing); a replayed `clientId` makes no second KOT. Reused later for approved customer orders (M5-T6). Publishes `kot.created { kotId, number, orderId, tableId }` → kitchen + staff; the order screen shows "Sent to kitchen — KOT #12" | One ticket per send, never half-saved |
| 2026-11-19 | **Daily KOT number:** new `KotCounter (outletId, businessDate, last)` (migration `kot_daily_number`, scope `outlet`) and `Kot.businessDate` with unique (`outletId`, `businessDate`, `number`). Next number = `INSERT … ON CONFLICT DO NOTHING` then `UPDATE last = last + 1` in the send's transaction — concurrent sends queue on the row lock (tested: 10 at once → 1–10, no gaps or repeats). An upsert was tried first and failed under concurrency (its insert errors abort the transaction). Database only, no Redis (rule 5). **Business day = outlet-local calendar date** (`businessDateOf`, `Outlet.timezone`); a late-night cut-off (e.g. 4 am) can become an outlet setting later | Correct numbering under load; kitchen never blocked |
| | *(add new decisions here)* | |

## 18. Open questions (resolve before the milestone that needs them)

- [ ] OTP / SMS provider (M1) — must support Indian DLT-registered OTP templates
- [ ] Google Cloud project + OAuth consent screen + redirect URIs for dev/staging/prod (M1)
- [ ] Platform admin (`/admin`) login: Google sign-in restricted to an allowlist of team accounts? (M13)
- [ ] WhatsApp BSP choice and template approvals (M7)
- [ ] Payment gateway account + UPI QR approach confirmed (M7, M12)
- [ ] Printer models used by pilot restaurants (M6)
- [ ] Legal review: bill format, service charge, privacy notice and consent text under DPDP Act (M7)
- [ ] **CA to confirm GST treatment** (before M7 / launch): GST on the service charge (implemented: yes, at the item rate), rounding per line vs per rate, and the tax rates used for packaged goods (allowed item rates are the Sept 2025 slabs **0/5/18/40 %** in `packages/shared/src/menu.ts`; seed uses 18% water, 40% aerated drinks; compensation cess not modelled). One-file change in `packages/shared/src/gst.ts` if the answer differs
- [ ] Final product name and domain (before M3 QR printing)
- [ ] **i18n helper has no task.** CLAUDE.md requires Hindi strings via an i18n helper. Proposal: add M1-T8 "i18n setup" (e.g. `next-intl`, EN + HI message files, locale toggle) before the first customer-facing screen (M5-T6)
- [ ] Prisma version for M0-T2: npm `latest` is `8.0.0-rc` (release candidate). Proposal: use stable 7.10.x
