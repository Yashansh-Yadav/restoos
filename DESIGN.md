---
version: 1
name: RestoOS
description: Warm, photo-led hospitality UI adapted from the Airbnb design analysis (docs/design/reference/airbnb.DESIGN.md). White canvas, near-black ink, one warm "Masala" accent used sparingly, soft rounded shapes, modest type weights. Re-tuned for a restaurant POS — WCAG AA contrast, dark mode, 44px+ touch targets, Hindi support, and dense one-handed staff screens.

colors:
  light:
    primary: "#c8361a"           # Masala — CTAs, bell button, selected states (5.25:1 on white)
    primary-active: "#a82d14"    # pressed (6.88:1)
    primary-disabled: "#f3c4b8"
    on-primary: "#ffffff"
    ink: "#222222"
    body: "#3f3f3f"
    muted: "#6a6a6a"             # 5.41:1 on white, 5.05:1 on surface-soft
    hairline: "#dddddd"          # decorative dividers only
    border-input: "#8f8f8f"      # form-control outlines (3.23:1, meets non-text 3:1)
    canvas: "#ffffff"
    surface-soft: "#f7f7f7"
    surface-strong: "#f2f2f2"
    success: "#147a3a"
    warning: "#b45309"
    danger: "#b91c1c"
    info: "#1d4ed8"
    veg: "#1a8f3c"
    non-veg: "#8b3a1a"
    scrim: "rgba(0,0,0,0.5)"
  dark:
    primary: "#ff7a59"           # text on it is #121212 (7.30:1)
    primary-active: "#ff8a6b"
    primary-disabled: "#5a2a1f"
    on-primary: "#121212"
    ink: "#ededed"
    body: "#cfcfcf"
    muted: "#a3a3a3"             # 6.61:1 on surface
    hairline: "#2e2e2e"
    border-input: "#737373"
    canvas: "#121212"
    surface-soft: "#1e1e1e"
    surface-strong: "#262626"
    success: "#4ade80"
    warning: "#f59e0b"
    danger: "#f87171"
    info: "#60a5fa"
    veg: "#3fb862"
    non-veg: "#e0875c"
    scrim: "rgba(0,0,0,0.7)"

typography:
  fontFamily: "Inter, 'Noto Sans Devanagari', system-ui, -apple-system, Roboto, sans-serif"
  numeric: "font-variant-numeric: tabular-nums"   # all money, quantities, timers, KOT numbers
  scale:
    display-xl: { size: 28px, weight: 700, lineHeight: 1.4 }   # owner "Today" headline figure labels, page titles
    stat:       { size: 40px, weight: 700, lineHeight: 1.1, letterSpacing: -0.5px }  # dashboard KPIs, bill grand total
    display-lg: { size: 22px, weight: 600, lineHeight: 1.2 }   # screen titles, table label in order header
    display-sm: { size: 20px, weight: 600, lineHeight: 1.2 }   # section heads, category headers
    title-md:   { size: 16px, weight: 600, lineHeight: 1.25 }  # item names, card titles
    body-md:    { size: 16px, weight: 400, lineHeight: 1.5 }   # default text (never smaller for inputs — prevents iOS zoom)
    body-sm:    { size: 14px, weight: 400, lineHeight: 1.43 }  # meta, descriptions, prices on cards
    caption:    { size: 14px, weight: 500, lineHeight: 1.3 }   # field labels, tab labels
    badge:      { size: 12px, weight: 600, lineHeight: 1.2 }   # status pills, "Out of stock", "NEW"
    button-lg:  { size: 18px, weight: 600, lineHeight: 1.2 }   # staff primary actions (Send, Bill, Accept)
    button-md:  { size: 16px, weight: 500, lineHeight: 1.25 }
  minimum: 12px   # nothing smaller, anywhere

rounded: { none: 0, xs: 4px, sm: 8px, md: 14px, lg: 20px, xl: 32px, full: 9999px }

spacing: { xxs: 2px, xs: 4px, sm: 8px, md: 12px, base: 16px, lg: 24px, xl: 32px, xxl: 48px, section: 64px }

elevation:
  flat: none
  float: "0 0 0 1px rgba(0,0,0,0.02), 0 2px 6px rgba(0,0,0,0.04), 0 4px 8px rgba(0,0,0,0.10)"
  # dark mode: no shadow; use surface-soft/surface-strong + hairline border instead

touch:
  minimum: 44px        # hard rule (CLAUDE.md #10)
  staff-default: 56px  # primary staff buttons, item tiles' tap area, steppers
  staff-hero: 64px     # Send to kitchen, Bill, Accept bell, Mark paid
  gap-min: 8px         # between adjacent tap targets
---

# RestoOS Design System

> Base: Airbnb design analysis from [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) (MIT), kept verbatim at `docs/design/reference/airbnb.DESIGN.md`. We borrow its **language** (white canvas, single warm accent, soft radii, modest type, photo-first cards, one shadow tier). We do **not** use Airbnb's name, colour (#ff385c), font (Cereal) or iconography.
>
> Precedence: `CLAUDE.md` hard rules > this file > `/web-interface-guidelines` > design skills (`design-taste-frontend`, `ui-ux-pro-max` and its bundled `design`, `design-system`, `brand`, `ui-styling`). Skills may inform choices (UX rules, chart types, component patterns) but must not generate a competing palette, font, or token set — change this file instead.

## 1. Atmosphere

Warm, calm, trustworthy. 90% white (or near-black in dark mode) + ink; the **Masala** accent appears only on the one action that matters on each screen. Food photography carries visual weight on the customer menu; on staff screens, **status colour and big type** carry it instead.

Three surfaces, one system — density changes, tokens don't:

| Surface | Feel | Density | Priority |
|---|---|---|---|
| Customer `/t/*` | Airbnb-like: photo-led, airy, friendly | Low | Fast LCP on 4G, Hindi toggle, bell always reachable |
| Staff `/staff/*` | Tool: high-contrast, glanceable, thumb-first | High | Click budgets, ≥56px targets, works in bright kitchens and dim dining rooms |
| Owner `/owner/*` | Calm dashboard | Medium | "Today" at 0 taps, numbers first |

## 2. Colour roles

- **Primary (Masala)** — the single primary CTA per view, selected tab underline, active cart badge, the customer 🔔 button. Never for large backgrounds, never for errors.
- **Ink / body / muted** — all text. Never pure black text on white; never pure white text on dark (use `ink` tokens).
- **Semantic** — `success` (paid, ready, accepted), `warning` (late KOT, bell escalating, trial ending), `danger` (void, cancel, errors, missed), `info` (pending approval, offline sync). Always pair colour with an icon or label — never colour alone.
- **Rating stars render in `ink`**, not gold (kept from source — feels premium, avoids "cheap" look).
- **Diet markers** follow the Indian FSSAI convention: square outline with filled circle for veg (`veg`), square outline with filled triangle for non-veg (`non-veg`), egg uses `warning`. 16px on cards, always with `aria-label`.

### Table status palette (staff floor view)

| Status | Fill (light) | Treatment |
|---|---|---|
| FREE | `canvas` + `border-input` outline | Plain |
| OCCUPIED | `surface-strong` | Ink label |
| ORDERED | `info` 12% tint | `info` left bar |
| BILL_REQUESTED | `warning` 15% tint | `warning` left bar + icon |
| PAID | `success` 12% tint | `success` left bar |
| CLEANING | `surface-soft`, dashed outline | Muted label + broom icon |
| Active bell | any status | Pulsing `primary` ring + 🔔 badge (static ring under `prefers-reduced-motion`) |

Use the same hues in dark mode via the `dark` tokens (tints at ~20%).

## 3. Typography

- **Inter** for Latin, **Noto Sans Devanagari** for Hindi (loaded via `next/font`, `display: swap`, subset). Devanagari needs ~10% more line-height — the i18n layout must not clip matras.
- Modest weights (from source): titles 600, display 600–700, body 400. Loudness comes from **size on numbers**, not weight on words.
- The single loud moment per screen is a **number**: grand total on the bill, KPI on the owner dashboard, KOT number on a kitchen card, timer on a late order (`stat` token).
- All money, quantities and timers use `tabular-nums` and `formatINR(paise)`.
- Body and inputs never below 16px (prevents mobile zoom); nothing below 12px.

## 4. Shape & elevation

- Buttons and inputs `rounded.sm` (8px); cards `rounded.md` (14px); sheets and dialogs `rounded.lg` (20px, top corners only for bottom sheets); search, chips, status pills, bell button `rounded.full`.
- One shadow (`elevation.float`) — dropdowns, floating cart bar, hovered cards on desktop. Everything else is flat. In dark mode, separate with surface steps + hairlines, not shadows.

## 5. Components (map onto shadcn/ui variants)

**Buttons**
- `primary` — Masala fill, `on-primary` text, 48px (customer/owner) / 56–64px (staff). One per view.
- `secondary` — canvas fill, 1px ink outline.
- `ghost` — text only, underline on hover (desktop).
- `destructive` — `danger` fill; always behind a confirm or undo (bill cancel, void need a reason sheet).
- Loading: keep the label, add spinner, text ends with "…" (e.g. "Sending…").

**Customer menu (`/t/[qrToken]`)**
- Sticky top: outlet name + Hindi/English toggle + veg-only switch; pill search (`rounded.full`, 48px).
- Category strip: horizontal scroll, active = ink label + 2px ink underline (source's product-tab pattern).
- Item card: photo optional (1:1 thumb right-aligned, `rounded.md`, explicit width/height, lazy below fold) · diet marker · name `title-md` · description `body-sm` muted 2-line clamp · price `title-md` tabular · "Add" secondary pill → becomes a stepper.
- Out of stock: 50% opacity image, `badge` "Out of stock", Add disabled — stays in the list (don't hide).
- Floating bell: 56px circle, Masala, bottom-right, safe-area aware. Opens a bottom sheet with three 64px role buttons (Butler / Cashier / Manager) → 2 taps total.
- Cart: sticky bottom bar (source's mobile reservation-bar pattern) — item count + total + primary "Place order".
- Post-payment: thank-you, 1–5 private rating, Google review button shown to **everyone** (no gating).

**Staff**
- Bottom tab bar (thumb zone), 64px, icons + labels, max 5 tabs per role.
- Floor grid: table tiles min 88×88px, label `display-sm`, status per §2, assigned-butler initials, bell/pending badges top-right.
- Order screen: item tiles 56px+ tall in a 2–3 column grid; tap = +1, long-press = variants/add-ons/note sheet; running total pinned bottom with a 64px "Send to kitchen".
- Kitchen display: three columns (New / Preparing / Ready); KOT card = KOT number `stat`, table label, items `title-md`, elapsed timer (turns `warning` then `danger` past threshold). Whole card is the tap target to advance.
- Bell alert: full-screen takeover, table label `stat`, 64px "Accept" (primary) + "Busy" (secondary → reason chips). Station mode adds a looping sound + vibration until accepted.
- Offline banner: persistent `info` strip at top, "Offline — bills will sync" (via i18n). Bell and self-ordering show "Needs internet".

**Owner**
- "Today" grid of stat cards: label `caption` muted, value `stat`, delta vs yesterday `badge` in success/danger.
- Tables/reports: `body-sm`, tabular nums, sticky header, right-aligned numbers, virtualise >50 rows.

**Forms** (from source `text-input`, adapted)
- 48px height (56px on staff), `rounded.sm`, 1px `border-input`, label above in `caption`. Focus: 2px ink border **plus** a visible `focus-visible` ring (source had no ring — we need one for accessibility). Errors inline in `danger` with the fix stated.
- PIN pad: 3×4 grid of 72px circular keys, `display-lg` digits.

**Status pills** — `rounded.full`, `badge` type, tinted background + solid text in the semantic colour.

## 6. Layout

- 4px base grid, tokens above. Mobile-first; 16px page gutter on phones, 24px tablet, max width 1280px (owner) — staff screens use the full width of the tablet.
- Breakpoints (Tailwind): `sm` 640 · `md` 768 (tablet counter/kitchen) · `lg` 1024 · `xl` 1280.
- Respect `env(safe-area-inset-*)` for every fixed bottom bar and the bell button.
- Customer menu: 64px section spacing on desktop only; on phones keep it dense (16–24px) — diners want to scroll the menu fast.

## 7. Motion

- 150–200ms ease-out for state changes; animate `transform`/`opacity` only; list properties explicitly (no `transition: all`).
- The only attention-seeking motion is the bell (pulse ring on staff tiles, full-screen alert). Everything else is quiet.
- `prefers-reduced-motion`: pulses become static rings, sheets fade instead of slide.

## 8. Do / Don't

**Do**
- One Masala element per view; let status colours do the rest on staff screens.
- Make the number the hero (totals, timers, KPIs).
- Keep out-of-stock items visible but disabled.
- Test every screen in light **and** dark, English **and** Hindi, at 360px width.

**Don't**
- Don't copy Airbnb branding (name, #ff385c, Cereal font, illustrated icons).
- Don't use Masala for errors or destructive actions — that's `danger`.
- Don't put critical actions in hover-only UI or behind gestures without a button alternative.
- Don't go below 44px for any tap target, or 16px for input text.
- Don't use gold stars or review gating.

## 9. Implementation notes

- Tokens live as CSS variables in `apps/web/src/app/globals.css` (`:root` + `.dark`) and are mapped in the Tailwind preset in `packages/config`; shadcn's `--primary`, `--destructive`, `--muted`, `--border`, `--ring`, `--radius` (= 8px) map to the tokens above.
- Agent prompt shorthand: *"RestoOS style: white canvas, ink #222 text, single Masala #c8361a CTA, 8px buttons / 14px cards / pill chips, one soft shadow, Inter + Noto Sans Devanagari, tabular numbers, 56px staff targets, dark mode via tokens."*
