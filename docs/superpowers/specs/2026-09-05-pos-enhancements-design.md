# POS Enhancements (Phases 7-11) — Design Spec

## Overview

The POS MVP (Phases 1-6, spec'd in `POS_MVP_Product_Technical_Specification.docx`) is complete and shipped. This spec covers a second wave of features requested against a UI mockup that goes beyond the original MVP's scope: product categories and images, payment-method tracking, a richer POS checkout flow (Hold, Discount, click-to-add), sale voiding, CSV export, and an upgraded Dashboard.

This is deliberately scoped as **five independent phases** (numbered 7-11, continuing on from the existing Phase 1-6 numbering), each with its own plan and its own subagent-driven-development cycle — the same process already used for Phases 1-6. This document is the shared design all five phases are built from; each phase's own plan (`docs/superpowers/plans/`) will carry the exact code, following `writing-plans`.

## Explicitly Out of Scope

The mockup that prompted this also showed **Customers**, **Reports**, and **Settings/Admin-login** pages. These are deliberately excluded from this round:

- **Customers** — no customer data model, no loyalty/history-by-customer. Out of scope entirely; not designed here.
- **Reports** — a separate reporting page beyond the Dashboard. Out of scope; the Dashboard upgrade in Phase 11 is the only analytics surface touched.
- **Settings / Admin login** — no authentication, no user accounts, no role-based permissions. The MVP's existing single-device, no-login posture (per the original spec's §13, "MVP single-device ไม่จำเป็นต้องมีระบบ login เต็มรูปแบบ") is unchanged. Anywhere a "who did this" question comes up (e.g. voiding a sale), the answer is: no user identity exists yet, so nothing records *who* voided it, only *that* and *why*.

If any of these three are wanted later, they get their own brainstorming/spec cycle — they don't piggyback on this one.

## Ordering and Rationale

Phase 7 → 8 → 9 → 10 → 11, chosen for dependency order (each phase's UI needs data the previous phase introduced):

1. **Phase 7 — Product Enrichment**: categories + images. Nothing later depends on anything before this.
2. **Phase 8 — Payment Method Tracking**: schema + checkout capture. Independent of Phase 7, but ordered before Phase 9/10/11 since they surface payment-method data.
3. **Phase 9 — POS UX**: click-to-add grid (needs Phase 7's images/categories), checkout now sends payment method + discount (needs Phase 8).
4. **Phase 10 — Sales History**: payment-method column/filter (needs Phase 8), Void (independent feature, placed here since it's exercised from this screen).
5. **Phase 11 — Dashboard**: payment breakdown chart (needs Phase 8's data actually existing in the DB to be meaningful), stat cards adapt existing patterns.

## Data Model Changes

All of the following are Drizzle schema changes in `src/main/database/schema.ts`, each phase generating its own migration via `npm run db:generate` (matching the existing per-phase migration history: `0000_petite_scream`, `0001_calm_warpath`).

### New table: `categories` (Phase 7)

```
categories
  id          text PK
  name        text NOT NULL UNIQUE
  createdAt   text NOT NULL
  updatedAt   text NOT NULL
```

### `products` table changes (Phase 7)

```
+ categoryId   text, nullable, FK -> categories.id
+ imagePath    text, nullable   -- relative path under the app's userData product-images folder; see "Product Images" below
```

Nullable by design: existing products (and newly-created ones) don't require a category or an image — the mockup shows every product with both, but the MVP shouldn't force data entry that blocks the existing "add a product fast while scanning" workflow.

**Deleting a category that still has products assigned is rejected** (a `CategoryInUseError`, matching the existing `ProductValidationError`/`DuplicateBarcodeError` convention in `product-repository.ts`) — the shop owner must reassign or clear those products' category first. This avoids orphaned `categoryId` values without needing `ON DELETE CASCADE` semantics that would silently detach products from their category.

### `sales` table changes (Phase 8, Phase 10)

```
+ paymentMethod   text NOT NULL   -- 'CASH' | 'QR' | 'CARD'
+ discountCents   integer NOT NULL DEFAULT 0
```

`status` already exists as a plain `text` column with no DB-level enum constraint (it's just always been the literal `'COMPLETED'` until now) — Phase 10's Void feature needs no schema change here, only the application code actually writing `'VOID'` as a second value. Every existing dashboard/history query in `dashboard-repository.ts`/`sales-history-repository.ts` already filters `eq(sales.status, 'COMPLETED')` defensively (added in Phase 4/5 even though nothing produced a non-COMPLETED row yet) — Phase 10 is what finally makes that filter load-bearing rather than dormant.

**Total calculation changes**: `completeSale`'s total becomes `subtotal - discountCents`, still entirely through `Money` (no raw arithmetic — Phase 4/5's Global Constraint carries forward unchanged). `discountCents` is validated as a non-negative integer that cannot exceed the subtotal (a `SaleValidationError`, matching the existing convention) — a discount larger than the bill is rejected outright rather than clamped, so the cashier gets an explicit error instead of a silently-wrong total.

### New table: `sale_voids` (Phase 10)

```
sale_voids
  id          text PK
  saleId      text NOT NULL, FK -> sales.id
  reason      text NOT NULL
  voidedAt    text NOT NULL
```

A separate audit table rather than columns bolted onto `sales`, matching the existing `stock_transactions` pattern of "the fact of a state change gets its own ledger row." No `voidedBy` column — see "Explicitly Out of Scope" above (no user identity exists).

**Voiding is one atomic transaction** (same `db.transaction()` mechanism as `completeSale`): update `sales.status` to `'VOID'`, insert one `sale_voids` row, and insert one `stock_transactions` row per original sale line with `type: 'VOID'` and a **positive** quantity (returning stock) — mirroring `completeSale`'s existing convention that `stock_transactions.quantity`'s sign is the actual delta (negative for a sale, positive for a return), so `SUM(quantity)` across a product's transactions still reconstructs its stock from zero. `products.stock` is incremented back by each line's quantity in the same transaction. **A sale can only be voided once** — voiding an already-`VOID` sale is rejected (`SaleAlreadyVoidError`). There is no un-void; this matches the original spec's "no hard-delete, only status" philosophy — a mistaken void is a new, separate business problem (manual stock adjustment), not something this feature reverses.

### stock_transactions.type

Already a plain `text` column (no schema change) — gains a third literal value, `'VOID'`, alongside the existing `'SALE'`.

## Phase 7 — Product Enrichment

**Categories**: full CRUD, exposed via a "Manage Categories" button on the Products page opening a modal (add / rename / delete) — not a new top-level nav item. The Products form (`ProductForm.tsx`) gains a category `<select>` populated from the categories list; the Products table gains a Category column and an "All Categories" filter dropdown alongside the existing search field.

**Product images**: uploaded from the local machine (a native file picker via Electron's `dialog.showOpenDialog`, filtered to image types), then **copied** into `app.getPath('userData')/product-images/<uuid>.<ext>` — never referenced from its original location, so the app doesn't break if the source file moves or is deleted after upload. `products.imagePath` stores the filename only (`<uuid>.<ext>`), not an absolute path, so the storage root can move between machines/versions without invalidating existing data — the same reasoning `getDbPath()`/`getMigrationsPath()` already apply to the DB file and migrations folder. A new `getProductImagesPath()` joins that pattern in `db-path.ts`. The Products form shows a preview of the selected image before saving; the Products table renders a thumbnail (or a neutral placeholder icon when `imagePath` is null) in a new Image column.

No image resizing/compression pipeline in this phase — files are copied as-is. If oversized uploads become a real problem, that's a follow-up, not a Phase 7 concern (YAGNI).

## Phase 8 — Payment Method Tracking

`PosPage`'s Finish Sale flow gains one step: after clicking "Finish Sale," a small modal (or inline selector — exact UI decided in the phase's own plan) asks the cashier to pick Cash / QR / Card before the sale actually commits. This is **purely a record of what the cashier observed**, not a payment integration — no QR code is generated, no card terminal is contacted, matching the answer already given (manual selection, no gateway).

`completeSale()`'s signature gains `paymentMethod: PaymentMethod` and `discountCents: number` (default 0) parameters; `SaleRecord` gains both fields for the receipt/history views to read back.

## Phase 9 — POS UX Enhancements

- **Click-to-add product grid**: alongside the existing barcode scan field (not replacing it) — clicking a product tile is equivalent to scanning its barcode (same `addScannedProduct` cart action, same stock/active checks). Category filter pills above the grid, populated from Phase 7's categories, plus an "All" pill.
- **Hold**: multiple concurrent held carts, kept in a new Zustand slice (`heldCarts: { id, label, items, heldAt }[]`) — **in-memory only, never persisted to the DB**. A held cart is lost if the app closes; this matches how a physical POS terminal's "park sale" feature normally behaves, and avoids a whole persistence/recovery design question that this phase doesn't need to answer. Actions: hold the current cart (prompts for an optional label), list held carts, resume one, discard one. **Resuming requires the active cart to be empty** — if the cashier has an in-progress cart when they try to resume a held one, the action is rejected with a message telling them to finish, clear, or hold the current cart first. This is a deliberately simple rule that avoids any ambiguity about merging or silently discarding cart contents.
- **Discount**: a single input field (fixed Baht amount, not a percentage) near the Subtotal/Total, matching the mockup's layout. Validated client-side the same way price/stock fields already are in this codebase, then passed to `completeSale()`.
- **Keyboard shortcut**: F12 triggers Finish Sale, matching the mockup's hint. No other new shortcuts in this phase.

## Phase 10 — Sales History Enhancements

- **Payment Method column** + filter dropdown (All / Cash / QR / Card).
- **Status filter** (All / Completed / Void) — "Void" is now a real, reachable status.
- **Void action**: a "Void" button/icon on Completed rows only (Void rows show no action, matching "no un-void"). Opens a modal requiring a reason (required, non-empty) and an explicit confirm step before committing — matching the earlier decision that both a reason and a confirmation step are required.
- **Export**: a button that writes a CSV of the currently-filtered list (Bill #, Date, Time, Payment Method, Items, Total, Status) via Electron's `dialog.showSaveDialog` + a hand-rolled CSV writer in the main process (no new dependency — this is a handful of well-understood string-escaping rules, not worth a library for one export button).
- **Date range filter** (from/to), applied alongside the existing search/payment/status filters.

## Phase 11 — Dashboard Analytics Upgrade

- **Stat cards**: Total Sales, Total Orders, Avg Order Value (= Total Sales ÷ Total Orders, guarding the zero-orders case), Units Sold — each showing a "+X% vs previous period" indicator. "Previous period" is always the immediately preceding, equal-length window: for the "Today" view that's yesterday; for the "7 Days" view that's the 7 days before the currently-shown 7.
- **One chart, toggled by a dropdown** (replacing the existing always-7-day `BarChart`): "Today" shows an hourly breakdown of the current day's sales; "7 Days" shows the existing daily-bucket view. Both views share one chart component parameterized by its data shape (an array of `{label, totalCents}` buckets), so the existing hand-rolled SVG bar-chart approach (no charting library) carries forward unchanged — only the query feeding it swaps per the dropdown.
- **Sales by Payment Method**: a new donut chart (hand-rolled SVG, same no-library approach as the bar chart), scoped to whichever period the main toggle is currently showing.
- **Top Products, Low Stock**: unchanged from Phase 5.

## Testing

Every phase follows the same standard already established in Phases 1-6: a test for every repository function, IPC handler, hook, and component touched or added — real assertions against a real SQLite DB for the backend, real rendered DOM for the frontend, no test-infrastructure invention. Particular cases worth calling out because they're easy to under-test:

- **Void's atomicity**: a rollback test mirroring `completeSale`'s existing one — force a failure partway through voiding a multi-line sale and assert nothing committed (sale still `COMPLETED`, no `sale_voids` row, stock unchanged).
- **Discount validation boundary**: discount exactly equal to the subtotal (allowed, total = 0) vs. discount one satang over the subtotal (rejected).
- **Category deletion guard**: deleting a category with zero products (allowed) vs. one or more products still assigned (rejected).
- **CSV export escaping**: a product/customer-adjacent field containing a comma or a quote character, to prove the hand-rolled CSV writer escapes correctly rather than producing a malformed file.

## What Each Phase's Own Plan Still Needs to Decide

This spec fixes the architecture and the data model; it deliberately leaves exact UI copy, exact component file names, and exact test code to each phase's own plan (written via `writing-plans` when that phase starts) — matching how Phases 1-6 were run. Nothing above should be read as a task-by-task implementation plan.
