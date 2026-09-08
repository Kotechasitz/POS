# Phase 5: Dashboard + Sales History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new read-only screens — a Dashboard (today's sales/orders/units, a 7-day sales trend, top products, low-stock list) and Sales History (a list of past bills with a per-bill line-item detail view) — reading data that Phase 4 already started writing (`sales`, `sale_items`, `stock_transactions`).

**Architecture:** Two new repository files add pure read queries against the existing schema (no new tables — Phase 1/4 already created `sales`/`sale_items`/`stock_transactions`). Two new IPC channel groups (`dashboard:*`, `salesHistory:*`) expose them. Two new renderer feature folders (`features/dashboard/`, `features/sales-history/`) each get a one-shot mount-fetch hook plus a page component, following the same pattern already established by `useProducts`/`ProductsPage`. `App.tsx` gains two more tabs. Because `App.tsx` already single-mounts exactly one tab's page component at a time (confirmed in `App.tsx`), switching to the Dashboard tab after completing a sale on POS naturally remounts `DashboardPage` and triggers a fresh fetch — this is how the spec's "Dashboard must reflect new totals after a successful sale" (§14.1) is satisfied, with no new plumbing.

**Tech Stack:** Electron main process (Drizzle ORM / better-sqlite3), IPC, React 19 renderer, Vitest + React Testing Library. No new dependencies — the 7-day trend is a small hand-rolled SVG bar chart, matching this project's existing precedent of a hand-built design system with no UI/chart library (the spec's own suggestion of MUI was already dropped project-wide during the Phase 2 UI redesign).

## Global Constraints

- Money is always an integer number of satang; any **JavaScript** arithmetic that touches a price or total goes through `src/shared/money.ts`'s `Money` class — never raw `+`/`*` on cents in application code. This does not apply to a SQL-level `SUM()` aggregate over an already-integer cents column (as in `getTopProducts`'s `SUM(sale_items.total_cents)`) — that's an exact integer aggregation done once in the query, not ad-hoc floating-point-risk arithmetic in JS, and recomputing a GROUP BY's aggregate in application code after the fact would be both slower and not what the constraint is guarding against. Every place this plan sums cents in JS (all of `getDashboardSummary`'s and `getSevenDaySales`'s totals) still goes through `Money.add`.
- The renderer must never import `better-sqlite3`/`drizzle-orm` or anything under `src/main/**` — all DB access crosses the `window.api` IPC boundary (enforced by `no-restricted-imports` in `eslint.config.mjs`).
- `src/shared/**` must not import from `src/main/**`.
- IPC "not found" convention: a repository function returns `undefined` for "not found"; the IPC handler converts it to `null` with `?? null` before it crosses to the renderer (already used by `products:getByBarcode`; this phase's `salesHistory:detail` follows the same pattern).
- **Local calendar-day boundaries, computed in the main process, not SQLite date functions.** `created_at` is stored as `new Date().toISOString()` (UTC). Computing "today" or "the last 7 days" with SQLite's `date()` on a UTC string would misalign with the shop's local calendar day for any non-UTC timezone. Every date-bucketed query in this phase computes day boundaries with plain JS `Date` (which reads the OS's local timezone) and passes ISO boundary strings into the `WHERE` clause — never `date(created_at)` in SQL.
- Whoever writes a change writes its test in the same task: cover positive, negative, and edge paths, and assert real outcomes (no "it didn't throw" tests).
- Follow the codebase's established conventions: repository functions take `db` as their first parameter; IPC handlers are thin delegations; hooks follow the `useProducts.ts` mount-fetch-with-ignore-flag pattern (including its documented, deliberate `eslint-disable-next-line react-hooks/set-state-in-effect`); modals follow `ProductForm.tsx`'s `role="dialog"`/`aria-modal`/Escape/backdrop-click pattern; errors surfacing from IPC go through `src/renderer/src/lib/ipcError.ts`'s `toUserMessage`.

## Design decisions

- **"Bill number" is computed, not a schema column.** The spec's Sales History mockup wants a short bill number (§6.4: "แสดงเลขที่บิล, วันเวลา, total"), but `sales.id` is a UUID. Rather than a schema migration adding an auto-increment column, `listSales` assigns sequential numbers in application code: query all sales ordered oldest-first, number them 1..N, then reverse for newest-first display. This is stable (a sale's number never changes once assigned, since it only depends on creation order) and needs no schema change.
- **Top Products joins the live `products` table for the display name**, not the sale-time snapshot in `sale_items.product_name`. Phase 4's "price/name snapshot" rule protects the historical accuracy of a *receipt* (a specific sale must always show what was actually charged). A leaderboard is a different kind of view — showing a product's current name there is correct and simpler than picking one arbitrary historical snapshot out of a GROUP BY.
- **No new tables, no new dependency.** `sales`/`sale_items`/`stock_transactions` already exist and are already populated by Phase 4's `completeSale`. The only schema change in this phase is one index.

## File Structure

- Modify: `src/main/database/schema.ts` — add an index on `sales.created_at`.
- Create (via `npm run db:generate`): a new file under `drizzle/` — the generated migration for that index.
- Create: `src/shared/dashboard.ts` — `DashboardSummary`, `TopProduct`, `DailySales`.
- Create: `src/shared/salesHistory.ts` — `SaleListItem`.
- Create: `src/main/database/repositories/dashboard-repository.ts` — `getDashboardSummary`, `getLowStockProducts` (Task 1), then `getTopProducts`, `getSevenDaySales` (Task 2).
- Create: `src/main/database/repositories/dashboard-repository.test.ts`
- Create: `src/main/database/repositories/sales-history-repository.ts` — `listSales`, `getSaleWithItems`.
- Create: `src/main/database/repositories/sales-history-repository.test.ts`
- Create: `src/main/ipc/register-dashboard-handlers.ts`
- Create: `src/main/ipc/register-dashboard-handlers.test.ts`
- Create: `src/main/ipc/register-sales-history-handlers.ts`
- Create: `src/main/ipc/register-sales-history-handlers.test.ts`
- Modify: `src/main/index.ts` — register both new handler groups.
- Modify: `src/preload/index.ts`, `src/preload/index.d.ts` — expose `window.api.dashboard.*` and `window.api.salesHistory.*`.
- Create: `src/renderer/src/features/dashboard/BarChart.tsx` (+ test)
- Create: `src/renderer/src/features/dashboard/useDashboard.ts` (+ test)
- Create: `src/renderer/src/features/dashboard/DashboardPage.tsx` (+ test)
- Create: `src/renderer/src/features/sales-history/useSalesHistory.ts` (+ test)
- Create: `src/renderer/src/features/sales-history/SaleDetailModal.tsx` (+ test)
- Create: `src/renderer/src/features/sales-history/SalesHistoryPage.tsx` (+ test)
- Modify: `src/renderer/src/App.tsx` — add Dashboard and Sales History tabs.
- Modify: `src/renderer/src/App.test.tsx` — extend the `window.api` mock, add tab-switch tests.
- Modify: `src/renderer/src/assets/main.css` — dashboard stat cards/panels/chart styles, sales-history table/modal styles.

---

### Task 1: Dashboard repository, part 1 — today's summary, low stock, and the `created_at` index

**Files:**
- Modify: `src/main/database/schema.ts`
- Create (generated): a new `drizzle/*.sql` migration
- Create: `src/shared/dashboard.ts`
- Create: `src/main/database/repositories/dashboard-repository.ts`
- Test: `src/main/database/repositories/dashboard-repository.test.ts`

**Interfaces:**
- Consumes: `products`, `sales`, `saleItems` tables from `src/main/database/schema.ts`; `Money` from `src/shared/money.ts`; `ProductRecord` from `src/shared/product.ts`.
- Produces: `src/shared/dashboard.ts`: `interface DashboardSummary { salesTodayCents: number; orderCountToday: number; unitsSoldToday: number }`, `interface TopProduct { productId: string; productName: string; totalQuantity: number; totalRevenueCents: number }`, `interface DailySales { date: string; totalCents: number }` (all three defined now; `TopProduct`/`DailySales` are used starting Task 2). `dashboard-repository.ts`: `function getDashboardSummary(db: BetterSQLite3Database, referenceDate?: Date): DashboardSummary`, `function getLowStockProducts(db: BetterSQLite3Database, threshold?: number): ProductRecord[]`, and a module-private `startOfDay(date: Date): Date` helper that Task 2 (same file) will reuse.

- [ ] **Step 1: Write the shared dashboard types**

```typescript
// src/shared/dashboard.ts
export interface DashboardSummary {
  salesTodayCents: number
  orderCountToday: number
  unitsSoldToday: number
}

export interface TopProduct {
  productId: string
  productName: string
  totalQuantity: number
  totalRevenueCents: number
}

export interface DailySales {
  date: string
  totalCents: number
}
```

- [ ] **Step 2: Add the index to the schema**

In `src/main/database/schema.ts`, change the `sales` table definition from:

```typescript
export const sales = sqliteTable('sales', {
  id: text('id').primaryKey(),
  totalCents: integer('total_cents').notNull(),
  status: text('status').notNull().default('COMPLETED'),
  createdAt: text('created_at').notNull()
})
```

to:

```typescript
export const sales = sqliteTable(
  'sales',
  {
    id: text('id').primaryKey(),
    totalCents: integer('total_cents').notNull(),
    status: text('status').notNull().default('COMPLETED'),
    createdAt: text('created_at').notNull()
  },
  (table) => ({
    createdAtIdx: index('sales_created_at_idx').on(table.createdAt)
  })
)
```

And add `index` to the existing import at the top of the file:

```typescript
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
```

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate`
Expected: a new file appears under `drizzle/` (drizzle-kit names it automatically). Open it and confirm it contains a `CREATE INDEX` statement on `sales` (`created_at`) and nothing else — if it contains unrelated changes, something else in the schema drifted; stop and report rather than committing an unexpected migration.

- [ ] **Step 4: Write the failing repository tests**

```typescript
// src/main/database/repositories/dashboard-repository.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createDbClient, type DbClient } from '../client'
import { sales, saleItems } from '../schema'
import { createProduct, updateProduct } from './product-repository'
import { completeSale } from './sale-repository'
import { getDashboardSummary, getLowStockProducts } from './dashboard-repository'
import type { SaleLineInput } from '../../../shared/sale'

function daysAgoIso(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

describe('getDashboardSummary', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-dashboard-repo-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('returns zeros when there are no sales at all', () => {
    const summary = getDashboardSummary(client.db)
    expect(summary).toEqual({ salesTodayCents: 0, orderCountToday: 0, unitsSoldToday: 0 })
  })

  it("sums today's sales, counts orders, and sums units sold across multiple sales", () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 50 })

    const line1: SaleLineInput = {
      productId: coke.id,
      productName: coke.name,
      unitPriceCents: coke.priceCents,
      quantity: 2
    }
    const line2: SaleLineInput = {
      productId: water.id,
      productName: water.name,
      unitPriceCents: water.priceCents,
      quantity: 3
    }
    completeSale(client.db, [line1]) // 4000 cents, 2 units
    completeSale(client.db, [line2]) // 3000 cents, 3 units

    const summary = getDashboardSummary(client.db)
    expect(summary).toEqual({ salesTodayCents: 7000, orderCountToday: 2, unitsSoldToday: 5 })
  })

  it("excludes sales from before today", () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    const now = new Date().toISOString()
    // Directly insert a sale timestamped yesterday — completeSale always uses
    // the real current time, so a fabricated old row is inserted straight
    // into the table to control the date deterministically.
    client.db
      .insert(sales)
      .values({ id: 'yesterday-sale', totalCents: 9999, status: 'COMPLETED', createdAt: daysAgoIso(1) })
      .run()
    client.db
      .insert(saleItems)
      .values({
        id: 'yesterday-item',
        saleId: 'yesterday-sale',
        productId: coke.id,
        productName: coke.name,
        priceCents: 9999,
        quantity: 7,
        totalCents: 9999
      })
      .run()

    const summary = getDashboardSummary(client.db)
    expect(summary).toEqual({ salesTodayCents: 0, orderCountToday: 0, unitsSoldToday: 0 })
    void now
  })

  it('excludes sales whose status is not COMPLETED', () => {
    client.db
      .insert(sales)
      .values({ id: 'cancelled-sale', totalCents: 5000, status: 'CANCELLED', createdAt: new Date().toISOString() })
      .run()

    const summary = getDashboardSummary(client.db)
    expect(summary.salesTodayCents).toBe(0)
    expect(summary.orderCountToday).toBe(0)
  })
})

describe('getLowStockProducts', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-dashboard-repo-lowstock-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('returns only products at or below the threshold, ordered by stock ascending', () => {
    createProduct(client.db, { barcode: '111', name: 'Plenty', priceCents: 100, stock: 50 })
    createProduct(client.db, { barcode: '222', name: 'Exactly at threshold', priceCents: 100, stock: 5 })
    createProduct(client.db, { barcode: '333', name: 'Very low', priceCents: 100, stock: 1 })

    const result = getLowStockProducts(client.db, 5)
    expect(result.map((p) => p.name)).toEqual(['Very low', 'Exactly at threshold'])
  })

  it('excludes inactive products even if their stock is low', () => {
    const inactive = createProduct(client.db, { barcode: '444', name: 'Discontinued', priceCents: 100, stock: 0 })
    updateProduct(client.db, inactive.id, { isActive: false })

    const result = getLowStockProducts(client.db, 5)
    expect(result).toHaveLength(0)
  })

  it('defaults to a threshold of 5 when none is given', () => {
    createProduct(client.db, { barcode: '555', name: 'Right at default', priceCents: 100, stock: 5 })
    createProduct(client.db, { barcode: '666', name: 'Above default', priceCents: 100, stock: 6 })

    const result = getLowStockProducts(client.db)
    expect(result.map((p) => p.name)).toEqual(['Right at default'])
  })
})
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npm test -- dashboard-repository`
Expected: FAIL — `dashboard-repository.ts` does not exist yet.

- [ ] **Step 6: Implement `getDashboardSummary` and `getLowStockProducts`**

```typescript
// src/main/database/repositories/dashboard-repository.ts
import { and, asc, eq, gte, inArray, lt, lte } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { products, sales, saleItems } from '../schema'
import type { DashboardSummary } from '../../../shared/dashboard'
import type { ProductRecord } from '../../../shared/product'
import { Money } from '../../../shared/money'

// Computed with the local (OS) timezone deliberately — see the plan's
// Global Constraints: created_at is stored as UTC, but "today" must mean
// the shop's local calendar day, not a UTC day.
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function getDashboardSummary(
  db: BetterSQLite3Database,
  referenceDate: Date = new Date()
): DashboardSummary {
  const start = startOfDay(referenceDate)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  const todaysSales = db
    .select()
    .from(sales)
    .where(
      and(
        eq(sales.status, 'COMPLETED'),
        gte(sales.createdAt, start.toISOString()),
        lt(sales.createdAt, end.toISOString())
      )
    )
    .all()

  const salesTodayCents = todaysSales
    .reduce((total, sale) => total.add(Money.fromCents(sale.totalCents)), Money.fromCents(0))
    .cents

  let unitsSoldToday = 0
  if (todaysSales.length > 0) {
    const saleIds = todaysSales.map((sale) => sale.id)
    const items = db.select().from(saleItems).where(inArray(saleItems.saleId, saleIds)).all()
    unitsSoldToday = items.reduce((sum, item) => sum + item.quantity, 0)
  }

  return {
    salesTodayCents,
    orderCountToday: todaysSales.length,
    unitsSoldToday
  }
}

export function getLowStockProducts(
  db: BetterSQLite3Database,
  threshold: number = 5
): ProductRecord[] {
  return db
    .select()
    .from(products)
    .where(and(eq(products.isActive, true), lte(products.stock, threshold)))
    .orderBy(asc(products.stock))
    .all() as ProductRecord[]
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- dashboard-repository`
Expected: PASS, all 7 tests green.

- [ ] **Step 8: Commit**

```bash
git add src/main/database/schema.ts drizzle/ src/shared/dashboard.ts src/main/database/repositories/dashboard-repository.ts src/main/database/repositories/dashboard-repository.test.ts
git commit -m "feat: add sales.created_at index and today's dashboard summary/low-stock queries"
```

---

### Task 2: Dashboard repository, part 2 — top products and the 7-day trend

**Files:**
- Modify: `src/main/database/repositories/dashboard-repository.ts` (add two functions to the file Task 1 created)
- Modify: `src/main/database/repositories/dashboard-repository.test.ts` (add two `describe` blocks)

**Interfaces:**
- Consumes: `startOfDay` (module-private, already in the file from Task 1); `products`, `sales`, `saleItems` tables; `TopProduct`/`DailySales` from `src/shared/dashboard.ts` (already defined by Task 1).
- Produces: `function getTopProducts(db: BetterSQLite3Database, limit?: number): TopProduct[]`, `function getSevenDaySales(db: BetterSQLite3Database, referenceDate?: Date): DailySales[]` for Task 4 (IPC handlers) to import.

- [ ] **Step 1: Write the failing tests**

Add to `src/main/database/repositories/dashboard-repository.test.ts` (new imports at the top: add `getTopProducts, getSevenDaySales` to the existing import from `./dashboard-repository`; add two new `describe` blocks at the end of the file):

```typescript
describe('getTopProducts', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-dashboard-repo-top-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('ranks products by total quantity sold, descending', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 50 })

    completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 2 }
    ])
    completeSale(client.db, [
      { productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 5 }
    ])

    const top = getTopProducts(client.db)
    expect(top[0]).toMatchObject({ productId: water.id, productName: 'Water', totalQuantity: 5, totalRevenueCents: 5000 })
    expect(top[1]).toMatchObject({ productId: coke.id, productName: 'Coke', totalQuantity: 2, totalRevenueCents: 4000 })
  })

  it('sums quantity across multiple sales of the same product', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 2 }
    ])
    completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 3 }
    ])

    const top = getTopProducts(client.db)
    expect(top).toHaveLength(1)
    expect(top[0].totalQuantity).toBe(5)
  })

  it('respects the limit', () => {
    const a = createProduct(client.db, { barcode: '1', name: 'A', priceCents: 100, stock: 50 })
    const b = createProduct(client.db, { barcode: '2', name: 'B', priceCents: 100, stock: 50 })
    const c = createProduct(client.db, { barcode: '3', name: 'C', priceCents: 100, stock: 50 })
    completeSale(client.db, [{ productId: a.id, productName: a.name, unitPriceCents: 100, quantity: 3 }])
    completeSale(client.db, [{ productId: b.id, productName: b.name, unitPriceCents: 100, quantity: 2 }])
    completeSale(client.db, [{ productId: c.id, productName: c.name, unitPriceCents: 100, quantity: 1 }])

    const top = getTopProducts(client.db, 2)
    expect(top).toHaveLength(2)
    expect(top.map((p) => p.productId)).toEqual([a.id, b.id])
  })

  it('returns an empty array when there are no sales', () => {
    expect(getTopProducts(client.db)).toEqual([])
  })
})

describe('getSevenDaySales', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-dashboard-repo-7day-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('returns exactly 7 entries, oldest first, all zero when there are no sales', () => {
    const result = getSevenDaySales(client.db)
    expect(result).toHaveLength(7)
    expect(result.every((day) => day.totalCents === 0)).toBe(true)
    expect(new Date(result[0].date).getTime()).toBeLessThan(new Date(result[6].date).getTime())
  })

  it("includes today's sales in the last bucket", () => {
    client.db
      .insert(sales)
      .values({ id: 'today-sale', totalCents: 1500, status: 'COMPLETED', createdAt: new Date().toISOString() })
      .run()

    const result = getSevenDaySales(client.db)
    expect(result[6].totalCents).toBe(1500)
  })

  it('includes a sale from exactly 6 days ago in the first bucket', () => {
    const sixDaysAgo = new Date()
    sixDaysAgo.setDate(sixDaysAgo.getDate() - 6)
    client.db
      .insert(sales)
      .values({ id: 'six-days-ago-sale', totalCents: 2500, status: 'COMPLETED', createdAt: sixDaysAgo.toISOString() })
      .run()

    const result = getSevenDaySales(client.db)
    expect(result[0].totalCents).toBe(2500)
  })

  it('excludes a sale from 7 days ago (one day outside the window)', () => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    client.db
      .insert(sales)
      .values({ id: 'seven-days-ago-sale', totalCents: 9999, status: 'COMPLETED', createdAt: sevenDaysAgo.toISOString() })
      .run()

    const result = getSevenDaySales(client.db)
    expect(result.reduce((sum, day) => sum + day.totalCents, 0)).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- dashboard-repository`
Expected: FAIL — `getTopProducts`/`getSevenDaySales` are not exported yet.

- [ ] **Step 3: Implement `getTopProducts` and `getSevenDaySales`**

Add to `src/main/database/repositories/dashboard-repository.ts`. First, extend the existing import line to add `desc` and `sql`:

```typescript
import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm'
```

And add `getTopProducts`/`getSevenDaySales` (plus a small private date-formatting helper) at the end of the file:

```typescript
export function getTopProducts(db: BetterSQLite3Database, limit: number = 5): TopProduct[] {
  return db
    .select({
      productId: saleItems.productId,
      productName: products.name,
      totalQuantity: sql<number>`SUM(${saleItems.quantity})`,
      totalRevenueCents: sql<number>`SUM(${saleItems.totalCents})`
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .innerJoin(products, eq(saleItems.productId, products.id))
    .where(eq(sales.status, 'COMPLETED'))
    .groupBy(saleItems.productId, products.name)
    .orderBy(desc(sql`SUM(${saleItems.quantity})`))
    .limit(limit)
    .all()
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getSevenDaySales(
  db: BetterSQLite3Database,
  referenceDate: Date = new Date()
): DailySales[] {
  const results: DailySales[] = []

  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const day = new Date(referenceDate)
    day.setDate(day.getDate() - daysAgo)
    const start = startOfDay(day)
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

    const daysSales = db
      .select()
      .from(sales)
      .where(
        and(
          eq(sales.status, 'COMPLETED'),
          gte(sales.createdAt, start.toISOString()),
          lt(sales.createdAt, end.toISOString())
        )
      )
      .all()

    const totalCents = daysSales
      .reduce((total, sale) => total.add(Money.fromCents(sale.totalCents)), Money.fromCents(0))
      .cents

    results.push({ date: formatDateOnly(start), totalCents })
  }

  return results
}
```

And add `TopProduct, DailySales` to the existing `import type { DashboardSummary } from '../../../shared/dashboard'` line, making it `import type { DashboardSummary, TopProduct, DailySales } from '../../../shared/dashboard'`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- dashboard-repository`
Expected: PASS, all 16 tests green (7 from Task 1 + 9 new).

- [ ] **Step 5: Commit**

```bash
git add src/main/database/repositories/dashboard-repository.ts src/main/database/repositories/dashboard-repository.test.ts
git commit -m "feat: add top-products and 7-day-sales dashboard queries"
```

---

### Task 3: Sales-history repository — `listSales` and `getSaleWithItems`

**Files:**
- Create: `src/shared/salesHistory.ts`
- Create: `src/main/database/repositories/sales-history-repository.ts`
- Test: `src/main/database/repositories/sales-history-repository.test.ts`

**Interfaces:**
- Consumes: `sales`, `saleItems` tables; `SaleRecord` from `src/shared/sale.ts` (Phase 4).
- Produces: `src/shared/salesHistory.ts`: `interface SaleListItem { id: string; billNumber: number; totalCents: number; createdAt: string; itemCount: number }`. `sales-history-repository.ts`: `function listSales(db: BetterSQLite3Database): SaleListItem[]`, `function getSaleWithItems(db: BetterSQLite3Database, saleId: string): SaleRecord | undefined` — for Task 5 (IPC) to import. `getSaleWithItems` returns `undefined` for "not found" (not an error), matching the codebase's IPC-conversion convention.

- [ ] **Step 1: Write the shared type**

```typescript
// src/shared/salesHistory.ts
export interface SaleListItem {
  id: string
  billNumber: number
  totalCents: number
  createdAt: string
  itemCount: number
}
```

- [ ] **Step 2: Write the failing tests**

```typescript
// src/main/database/repositories/sales-history-repository.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createDbClient, type DbClient } from '../client'
import { createProduct } from './product-repository'
import { completeSale } from './sale-repository'
import { listSales, getSaleWithItems } from './sales-history-repository'

describe('listSales', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-sales-history-repo-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('returns an empty array when there are no sales', () => {
    expect(listSales(client.db)).toEqual([])
  })

  it('assigns sequential bill numbers in creation order and lists newest first', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    const first = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 }
    ])
    const second = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 2 }
    ])

    const list = listSales(client.db)
    expect(list).toHaveLength(2)
    // Newest first:
    expect(list[0]).toMatchObject({ id: second.id, billNumber: 2 })
    expect(list[1]).toMatchObject({ id: first.id, billNumber: 1 })
  })

  it('reports the correct item count per sale', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 50 })

    const twoLineSale = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 },
      { productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 1 }
    ])
    const oneLineSale = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 }
    ])

    const list = listSales(client.db)
    const twoLine = list.find((s) => s.id === twoLineSale.id)
    const oneLine = list.find((s) => s.id === oneLineSale.id)
    expect(twoLine?.itemCount).toBe(2)
    expect(oneLine?.itemCount).toBe(1)
  })
})

describe('getSaleWithItems', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-sales-history-repo-detail-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('returns the full sale record with its line items', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    const sale = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 3 }
    ])

    const detail = getSaleWithItems(client.db, sale.id)
    expect(detail?.totalCents).toBe(6000)
    expect(detail?.status).toBe('COMPLETED')
    expect(detail?.items).toHaveLength(1)
    expect(detail?.items[0]).toMatchObject({ productName: 'Coke', quantity: 3, totalCents: 6000 })
  })

  it('returns undefined for a sale id that does not exist', () => {
    expect(getSaleWithItems(client.db, 'does-not-exist')).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- sales-history-repository`
Expected: FAIL — `sales-history-repository.ts` does not exist yet.

- [ ] **Step 4: Implement `listSales` and `getSaleWithItems`**

```typescript
// src/main/database/repositories/sales-history-repository.ts
import { eq, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { sales, saleItems } from '../schema'
import type { SaleListItem } from '../../../shared/salesHistory'
import type { SaleRecord } from '../../../shared/sale'

export function listSales(db: BetterSQLite3Database): SaleListItem[] {
  const rows = db
    .select({
      id: sales.id,
      totalCents: sales.totalCents,
      createdAt: sales.createdAt,
      itemCount: sql<number>`COUNT(${saleItems.id})`
    })
    .from(sales)
    .leftJoin(saleItems, eq(saleItems.saleId, sales.id))
    .groupBy(sales.id)
    .orderBy(sales.createdAt)
    .all()

  // Number oldest-to-newest (stable, creation-order bill numbers), then
  // reverse so the returned list itself is newest-first for display.
  return rows.map((row, index) => ({ ...row, billNumber: index + 1 })).reverse()
}

export function getSaleWithItems(
  db: BetterSQLite3Database,
  saleId: string
): SaleRecord | undefined {
  const sale = db.select().from(sales).where(eq(sales.id, saleId)).get()
  if (!sale) {
    return undefined
  }
  const items = db.select().from(saleItems).where(eq(saleItems.saleId, saleId)).all()
  return {
    id: sale.id,
    totalCents: sale.totalCents,
    status: sale.status,
    createdAt: sale.createdAt,
    items
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- sales-history-repository`
Expected: PASS, all 6 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/shared/salesHistory.ts src/main/database/repositories/sales-history-repository.ts src/main/database/repositories/sales-history-repository.test.ts
git commit -m "feat: add sales-history repository (listSales, getSaleWithItems)"
```

---

### Task 4: IPC handlers + preload wiring for dashboard and sales history

**Files:**
- Create: `src/main/ipc/register-dashboard-handlers.ts`
- Test: `src/main/ipc/register-dashboard-handlers.test.ts`
- Create: `src/main/ipc/register-sales-history-handlers.ts`
- Test: `src/main/ipc/register-sales-history-handlers.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

**Interfaces:**
- Consumes: `getDashboardSummary`, `getTopProducts`, `getSevenDaySales`, `getLowStockProducts` from `../database/repositories/dashboard-repository.ts` (Tasks 1-2); `listSales`, `getSaleWithItems` from `../database/repositories/sales-history-repository.ts` (Task 3); `DashboardSummary`, `TopProduct`, `DailySales` from `../../shared/dashboard.ts`; `SaleListItem` from `../../shared/salesHistory.ts`; `SaleRecord` from `../../shared/sale.ts`; `ProductRecord` from `../../shared/product.ts`.
- Produces: IPC channels `dashboard:summary`, `dashboard:topProducts`, `dashboard:sevenDaySales`, `dashboard:lowStock`, `salesHistory:list`, `salesHistory:detail`. `window.api.dashboard.{summary, topProducts, sevenDaySales, lowStock}` and `window.api.salesHistory.{list, detail}` for Tasks 5-6 to call.

- [ ] **Step 1: Write the failing IPC handler tests**

```typescript
// src/main/ipc/register-dashboard-handlers.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener)
    }
  }
}))

import { registerDashboardHandlers } from './register-dashboard-handlers'
import { createDbClient, type DbClient } from '../database/client'
import { createProduct } from '../database/repositories/product-repository'
import { completeSale } from '../database/repositories/sale-repository'
import type { DashboardSummary } from '../../shared/dashboard'

describe('registerDashboardHandlers', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    handlers.clear()
    dbFile = path.join(os.tmpdir(), `pos-ipc-dashboard-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../drizzle'))
    registerDashboardHandlers(client.db)
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('registers all four dashboard channels', () => {
    expect(handlers.has('dashboard:summary')).toBe(true)
    expect(handlers.has('dashboard:topProducts')).toBe(true)
    expect(handlers.has('dashboard:sevenDaySales')).toBe(true)
    expect(handlers.has('dashboard:lowStock')).toBe(true)
  })

  it('dashboard:summary reflects a completed sale', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 2 }
    ])

    const summaryHandler = handlers.get('dashboard:summary')!
    const summary = summaryHandler({}) as DashboardSummary
    expect(summary).toEqual({ salesTodayCents: 4000, orderCountToday: 1, unitsSoldToday: 2 })
  })

  it('dashboard:topProducts passes a given limit through', () => {
    const a = createProduct(client.db, { barcode: '1', name: 'A', priceCents: 100, stock: 50 })
    const b = createProduct(client.db, { barcode: '2', name: 'B', priceCents: 100, stock: 50 })
    completeSale(client.db, [{ productId: a.id, productName: a.name, unitPriceCents: 100, quantity: 2 }])
    completeSale(client.db, [{ productId: b.id, productName: b.name, unitPriceCents: 100, quantity: 1 }])

    const topProductsHandler = handlers.get('dashboard:topProducts')!
    const result = topProductsHandler({}, 1) as unknown[]
    expect(result).toHaveLength(1)
  })

  it('dashboard:lowStock passes a given threshold through', () => {
    createProduct(client.db, { barcode: '333', name: 'Scarce', priceCents: 100, stock: 2 })
    createProduct(client.db, { barcode: '444', name: 'Plenty', priceCents: 100, stock: 20 })

    const lowStockHandler = handlers.get('dashboard:lowStock')!
    const result = lowStockHandler({}, 3) as unknown[]
    expect(result).toHaveLength(1)
  })
})
```

```typescript
// src/main/ipc/register-sales-history-handlers.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener)
    }
  }
}))

import { registerSalesHistoryHandlers } from './register-sales-history-handlers'
import { createDbClient, type DbClient } from '../database/client'
import { createProduct } from '../database/repositories/product-repository'
import { completeSale } from '../database/repositories/sale-repository'

describe('registerSalesHistoryHandlers', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    handlers.clear()
    dbFile = path.join(os.tmpdir(), `pos-ipc-sales-history-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../drizzle'))
    registerSalesHistoryHandlers(client.db)
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('registers salesHistory:list and salesHistory:detail', () => {
    expect(handlers.has('salesHistory:list')).toBe(true)
    expect(handlers.has('salesHistory:detail')).toBe(true)
  })

  it('salesHistory:list returns completed sales', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 }
    ])

    const listHandler = handlers.get('salesHistory:list')!
    const list = listHandler({}) as unknown[]
    expect(list).toHaveLength(1)
  })

  it('salesHistory:detail returns the sale, or null when there is no match', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    const sale = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 }
    ])

    const detailHandler = handlers.get('salesHistory:detail')!
    const found = detailHandler({}, sale.id) as { id: string } | null
    expect(found?.id).toBe(sale.id)
    expect(detailHandler({}, 'nope')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- register-dashboard-handlers register-sales-history-handlers`
Expected: FAIL — neither handler file exists yet.

- [ ] **Step 3: Implement the IPC handlers**

```typescript
// src/main/ipc/register-dashboard-handlers.ts
import { ipcMain } from 'electron'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import {
  getDashboardSummary,
  getTopProducts,
  getSevenDaySales,
  getLowStockProducts
} from '../database/repositories/dashboard-repository'
import type { DashboardSummary, TopProduct, DailySales } from '../../shared/dashboard'
import type { ProductRecord } from '../../shared/product'

export function registerDashboardHandlers(db: BetterSQLite3Database): void {
  ipcMain.handle('dashboard:summary', (): DashboardSummary => {
    return getDashboardSummary(db)
  })

  ipcMain.handle('dashboard:topProducts', (_event, limit?: number): TopProduct[] => {
    return limit === undefined ? getTopProducts(db) : getTopProducts(db, limit)
  })

  ipcMain.handle('dashboard:sevenDaySales', (): DailySales[] => {
    return getSevenDaySales(db)
  })

  ipcMain.handle('dashboard:lowStock', (_event, threshold?: number): ProductRecord[] => {
    return threshold === undefined ? getLowStockProducts(db) : getLowStockProducts(db, threshold)
  })
}
```

```typescript
// src/main/ipc/register-sales-history-handlers.ts
import { ipcMain } from 'electron'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { listSales, getSaleWithItems } from '../database/repositories/sales-history-repository'
import type { SaleListItem } from '../../shared/salesHistory'
import type { SaleRecord } from '../../shared/sale'

export function registerSalesHistoryHandlers(db: BetterSQLite3Database): void {
  ipcMain.handle('salesHistory:list', (): SaleListItem[] => {
    return listSales(db)
  })

  ipcMain.handle('salesHistory:detail', (_event, saleId: string): SaleRecord | null => {
    return getSaleWithItems(db, saleId) ?? null
  })
}
```

- [ ] **Step 4: Wire both into `main/index.ts`**

Add imports:

```typescript
import { registerDashboardHandlers } from './ipc/register-dashboard-handlers'
import { registerSalesHistoryHandlers } from './ipc/register-sales-history-handlers'
```

And calls, right after the existing `registerSaleHandlers(dbClient.db)`:

```typescript
  registerDashboardHandlers(dbClient.db)
  registerSalesHistoryHandlers(dbClient.db)
```

- [ ] **Step 5: Expose both through the preload script**

In `src/preload/index.ts`, add imports:

```typescript
import type { DashboardSummary, TopProduct, DailySales } from '../shared/dashboard'
import type { SaleListItem } from '../shared/salesHistory'
```

And extend the `api` object (after the existing `sales` block):

```typescript
  dashboard: {
    summary: (): Promise<DashboardSummary> => ipcRenderer.invoke('dashboard:summary'),
    topProducts: (limit?: number): Promise<TopProduct[]> =>
      ipcRenderer.invoke('dashboard:topProducts', limit),
    sevenDaySales: (): Promise<DailySales[]> => ipcRenderer.invoke('dashboard:sevenDaySales'),
    lowStock: (threshold?: number): Promise<ProductRecord[]> =>
      ipcRenderer.invoke('dashboard:lowStock', threshold)
  },
  salesHistory: {
    list: (): Promise<SaleListItem[]> => ipcRenderer.invoke('salesHistory:list'),
    detail: (saleId: string): Promise<SaleRecord | null> =>
      ipcRenderer.invoke('salesHistory:detail', saleId)
  }
```

- [ ] **Step 6: Type it in `src/preload/index.d.ts`**

Add the same two imports, and extend the `Window['api']` interface with:

```typescript
      dashboard: {
        summary: () => Promise<DashboardSummary>
        topProducts: (limit?: number) => Promise<TopProduct[]>
        sevenDaySales: () => Promise<DailySales[]>
        lowStock: (threshold?: number) => Promise<ProductRecord[]>
      }
      salesHistory: {
        list: () => Promise<SaleListItem[]>
        detail: (saleId: string) => Promise<SaleRecord | null>
      }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- register-dashboard-handlers register-sales-history-handlers`
Expected: PASS, all 8 tests green.

- [ ] **Step 8: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS, no regressions.

- [ ] **Step 9: Commit**

```bash
git add src/main/ipc/register-dashboard-handlers.ts src/main/ipc/register-dashboard-handlers.test.ts src/main/ipc/register-sales-history-handlers.ts src/main/ipc/register-sales-history-handlers.test.ts src/main/index.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat: expose dashboard:* and salesHistory:* over IPC and preload"
```

---

### Task 5: Dashboard screen — `BarChart`, `useDashboard`, `DashboardPage`

**Files:**
- Create: `src/renderer/src/features/dashboard/BarChart.tsx`
- Test: `src/renderer/src/features/dashboard/BarChart.test.tsx`
- Create: `src/renderer/src/features/dashboard/useDashboard.ts`
- Test: `src/renderer/src/features/dashboard/useDashboard.test.ts`
- Create: `src/renderer/src/features/dashboard/DashboardPage.tsx`
- Test: `src/renderer/src/features/dashboard/DashboardPage.test.tsx`
- Modify: `src/renderer/src/assets/main.css`

**Interfaces:**
- Consumes: `window.api.dashboard.*` (Task 4); `DashboardSummary`, `TopProduct`, `DailySales` from `src/shared/dashboard.ts`; `ProductRecord` from `src/shared/product.ts`; `Money` from `src/shared/money.ts`; `toUserMessage` from `src/renderer/src/lib/ipcError.ts` (Phase 4).
- Produces: `BarChartProps { data: DailySales[] }` (default export `BarChart`); `function useDashboard(): { summary: DashboardSummary | null; topProducts: TopProduct[]; sevenDaySales: DailySales[]; lowStockProducts: ProductRecord[]; loading: boolean; error: string | null }`; default export `DashboardPage` for Task 7 (`App.tsx`) to render.

- [ ] **Step 1: Write the failing `BarChart` tests**

```typescript
// src/renderer/src/features/dashboard/BarChart.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import BarChart from './BarChart'
import type { DailySales } from '../../../../shared/dashboard'

const sevenDays: DailySales[] = [
  { date: '2026-08-28', totalCents: 1000 },
  { date: '2026-08-29', totalCents: 0 },
  { date: '2026-08-30', totalCents: 3000 },
  { date: '2026-08-31', totalCents: 2000 },
  { date: '2026-09-01', totalCents: 0 },
  { date: '2026-09-02', totalCents: 5000 },
  { date: '2026-09-03', totalCents: 4000 }
]

describe('BarChart', () => {
  it('renders one bar per day', () => {
    const { container } = render(<BarChart data={sevenDays} />)
    expect(container.querySelectorAll('.bar-chart-bar')).toHaveLength(7)
  })

  it('scales the tallest bar taller than a shorter one', () => {
    const { container } = render(<BarChart data={sevenDays} />)
    const bars = container.querySelectorAll('.bar-chart-bar')
    const heights = Array.from(bars).map((bar) => Number(bar.getAttribute('height')))
    // Day index 5 (5000 cents) must be taller than day index 0 (1000 cents).
    expect(heights[5]).toBeGreaterThan(heights[0])
    // A zero-value day still renders a bar (height 0), not a missing element.
    expect(heights[1]).toBe(0)
  })

  it('renders without error when every day is zero', () => {
    const empty: DailySales[] = sevenDays.map((day) => ({ ...day, totalCents: 0 }))
    const { container } = render(<BarChart data={empty} />)
    expect(container.querySelectorAll('.bar-chart-bar')).toHaveLength(7)
  })

  it('labels each bar with its weekday, read from the local calendar date not UTC', () => {
    const { container } = render(<BarChart data={sevenDays} />)
    const labels = container.querySelectorAll('.bar-chart-label')
    expect(labels).toHaveLength(7)
    // 2026-09-03 is a Thursday — assert the last label matches whatever the
    // test environment's locale renders for that specific local date, by
    // comparing against a locally-constructed Date for the same y/m/d
    // (not `new Date('2026-09-03')`, which parses as UTC and can drift a
    // day in either direction depending on the runner's timezone).
    const expected = new Date(2026, 8, 3).toLocaleDateString(undefined, { weekday: 'short' })
    expect(labels[6].textContent).toBe(expected)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- BarChart`
Expected: FAIL — `BarChart.tsx` does not exist yet.

- [ ] **Step 3: Implement `BarChart`**

```typescript
// src/renderer/src/features/dashboard/BarChart.tsx
import { Money } from '../../../../shared/money'
import type { DailySales } from '../../../../shared/dashboard'

export interface BarChartProps {
  data: DailySales[]
}

const WIDTH = 560
const HEIGHT = 140
const BAR_GAP = 12

// Parses a 'YYYY-MM-DD' string as a local date, not UTC — `new Date(str)`
// parses that format as UTC midnight, which can render as the wrong
// weekday depending on the viewer's timezone offset.
function parseDateOnlyLocal(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function BarChart({ data }: BarChartProps): React.JSX.Element {
  const maxCents = Math.max(1, ...data.map((day) => day.totalCents))
  const count = Math.max(data.length, 1)
  const barWidth = (WIDTH - BAR_GAP * (count - 1)) / count

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT + 24}`}
      role="img"
      aria-label="Sales for the last 7 days"
      className="bar-chart"
    >
      {data.map((day, index) => {
        const barHeight = (day.totalCents / maxCents) * HEIGHT
        const x = index * (barWidth + BAR_GAP)
        const y = HEIGHT - barHeight
        const label = parseDateOnlyLocal(day.date).toLocaleDateString(undefined, { weekday: 'short' })
        return (
          <g key={day.date}>
            <title>{`${day.date}: ${Money.fromCents(day.totalCents).format()}`}</title>
            <rect x={x} y={y} width={barWidth} height={barHeight} className="bar-chart-bar" />
            <text x={x + barWidth / 2} y={HEIGHT + 16} textAnchor="middle" className="bar-chart-label">
              {label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default BarChart
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- BarChart`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Write the failing `useDashboard` tests**

```typescript
// src/renderer/src/features/dashboard/useDashboard.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useDashboard } from './useDashboard'
import type { DashboardSummary, TopProduct, DailySales } from '../../../../shared/dashboard'
import type { ProductRecord } from '../../../../shared/product'

const summary: DashboardSummary = { salesTodayCents: 4000, orderCountToday: 2, unitsSoldToday: 5 }
const topProducts: TopProduct[] = [
  { productId: '1', productName: 'Coke', totalQuantity: 5, totalRevenueCents: 10000 }
]
const sevenDaySales: DailySales[] = [{ date: '2026-09-03', totalCents: 4000 }]
const lowStock: ProductRecord[] = [
  { id: '1', barcode: '111', name: 'Coke', priceCents: 2000, stock: 1, isActive: true, createdAt: '', updatedAt: '' }
]

describe('useDashboard', () => {
  beforeEach(() => {
    window.api = {
      dbHealth: vi.fn(),
      products: { list: vi.fn(), create: vi.fn(), update: vi.fn(), getByBarcode: vi.fn() },
      sales: { complete: vi.fn() },
      dashboard: {
        summary: vi.fn().mockResolvedValue(summary),
        topProducts: vi.fn().mockResolvedValue(topProducts),
        sevenDaySales: vi.fn().mockResolvedValue(sevenDaySales),
        lowStock: vi.fn().mockResolvedValue(lowStock)
      },
      salesHistory: { list: vi.fn(), detail: vi.fn() }
    } as unknown as Window['api']
  })

  it('starts in a loading state and then loads all four data sources', async () => {
    const { result } = renderHook(() => useDashboard())
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.summary).toEqual(summary)
    expect(result.current.topProducts).toEqual(topProducts)
    expect(result.current.sevenDaySales).toEqual(sevenDaySales)
    expect(result.current.lowStockProducts).toEqual(lowStock)
    expect(result.current.error).toBeNull()
  })

  it('surfaces a clean error message when a data source fails', async () => {
    ;(window.api.dashboard.summary as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Error invoking remote method 'dashboard:summary': Something broke")
    )
    const { result } = renderHook(() => useDashboard())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Something broke')
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test -- useDashboard`
Expected: FAIL — `useDashboard.ts` does not exist yet.

- [ ] **Step 7: Implement `useDashboard`**

```typescript
// src/renderer/src/features/dashboard/useDashboard.ts
import { useEffect, useState } from 'react'
import type { DashboardSummary, TopProduct, DailySales } from '../../../../shared/dashboard'
import type { ProductRecord } from '../../../../shared/product'
import { toUserMessage } from '../../lib/ipcError'

export interface UseDashboardResult {
  summary: DashboardSummary | null
  topProducts: TopProduct[]
  sevenDaySales: DailySales[]
  lowStockProducts: ProductRecord[]
  loading: boolean
  error: string | null
}

export function useDashboard(): UseDashboardResult {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [sevenDaySales, setSevenDaySales] = useState<DailySales[]>([])
  const [lowStockProducts, setLowStockProducts] = useState<ProductRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false

    async function load(): Promise<void> {
      setLoading(true)
      try {
        const [summaryResult, topProductsResult, sevenDaySalesResult, lowStockResult] = await Promise.all([
          window.api.dashboard.summary(),
          window.api.dashboard.topProducts(),
          window.api.dashboard.sevenDaySales(),
          window.api.dashboard.lowStock()
        ])
        if (!ignore) {
          setSummary(summaryResult)
          setTopProducts(topProductsResult)
          setSevenDaySales(sevenDaySalesResult)
          setLowStockProducts(lowStockResult)
          setError(null)
        }
      } catch (err) {
        if (!ignore) {
          setError(toUserMessage(err))
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    // Same deliberate pattern as useProducts.ts's mount-fetch effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    return () => {
      ignore = true
    }
  }, [])

  return { summary, topProducts, sevenDaySales, lowStockProducts, loading, error }
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- useDashboard`
Expected: PASS, both tests green.

- [ ] **Step 9: Add the dashboard CSS**

Append to `src/renderer/src/assets/main.css`:

```css
/* ---- Dashboard ---- */

.dashboard-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-4) var(--space-5);
}

.stat-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-ink-muted);
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-ink);
}

.dashboard-panels {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: var(--space-4);
  flex: 1;
  min-height: 0;
}

.dashboard-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-4) var(--space-5);
  overflow: auto;
}

.dashboard-panel h2 {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-ink);
}

.bar-chart {
  width: 100%;
  height: auto;
}

.bar-chart-bar {
  fill: var(--color-primary);
}

.bar-chart-label {
  font-size: 10px;
  fill: var(--color-ink-muted);
}

.top-products-list,
.low-stock-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: 14px;
}

.top-products-list li,
.low-stock-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.empty-hint {
  color: var(--color-ink-faint);
  font-size: 13px;
}

@media (max-width: 900px) {
  .dashboard-stats {
    grid-template-columns: 1fr;
  }
  .dashboard-panels {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 10: Write the failing `DashboardPage` tests**

```typescript
// src/renderer/src/features/dashboard/DashboardPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import DashboardPage from './DashboardPage'
import type { DashboardSummary, TopProduct, DailySales } from '../../../../shared/dashboard'
import type { ProductRecord } from '../../../../shared/product'

const summary: DashboardSummary = { salesTodayCents: 4000, orderCountToday: 2, unitsSoldToday: 5 }
const topProducts: TopProduct[] = [
  { productId: '1', productName: 'Coke', totalQuantity: 5, totalRevenueCents: 10000 }
]
const sevenDaySales: DailySales[] = [{ date: '2026-09-03', totalCents: 4000 }]
const lowStock: ProductRecord[] = [
  { id: '1', barcode: '111', name: 'Water', priceCents: 1000, stock: 1, isActive: true, createdAt: '', updatedAt: '' }
]

describe('DashboardPage', () => {
  beforeEach(() => {
    window.api = {
      dbHealth: vi.fn(),
      products: { list: vi.fn(), create: vi.fn(), update: vi.fn(), getByBarcode: vi.fn() },
      sales: { complete: vi.fn() },
      dashboard: {
        summary: vi.fn().mockResolvedValue(summary),
        topProducts: vi.fn().mockResolvedValue(topProducts),
        sevenDaySales: vi.fn().mockResolvedValue(sevenDaySales),
        lowStock: vi.fn().mockResolvedValue(lowStock)
      },
      salesHistory: { list: vi.fn(), detail: vi.fn() }
    } as unknown as Window['api']
  })

  it('renders the summary stats, formatted as money where applicable', async () => {
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('฿40.00')).toBeInTheDocument())
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders the top products list', async () => {
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('Coke')).toBeInTheDocument())
    expect(screen.getByText('5 sold')).toBeInTheDocument()
  })

  it('renders the low stock list', async () => {
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('Water')).toBeInTheDocument())
    expect(screen.getByText('1 left')).toBeInTheDocument()
  })

  it('shows an empty hint when there are no top products yet', async () => {
    ;(window.api.dashboard.topProducts as ReturnType<typeof vi.fn>).mockResolvedValue([])
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('No sales yet')).toBeInTheDocument())
  })

  it('shows an error message when loading fails', async () => {
    ;(window.api.dashboard.summary as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'))
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('boom'))
  })
})
```

- [ ] **Step 11: Run the test to verify it fails**

Run: `npm test -- DashboardPage`
Expected: FAIL — `DashboardPage.tsx` does not exist yet.

- [ ] **Step 12: Implement `DashboardPage`**

```typescript
// src/renderer/src/features/dashboard/DashboardPage.tsx
import { useDashboard } from './useDashboard'
import BarChart from './BarChart'
import { Money } from '../../../../shared/money'

function DashboardPage(): React.JSX.Element {
  const { summary, topProducts, sevenDaySales, lowStockProducts, loading, error } = useDashboard()

  if (loading) {
    return (
      <div className="products-page">
        <div className="loading-row">
          <span className="spinner" aria-hidden="true" />
          Loading dashboard…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="products-page">
        <p role="alert" className="alert alert-danger alert-inline">
          {error}
        </p>
      </div>
    )
  }

  return (
    <div className="products-page">
      <div className="products-header">
        <h1>Dashboard</h1>
      </div>

      <div className="dashboard-stats">
        <div className="stat-card">
          <span className="stat-label">Sales Today</span>
          <span className="stat-value">{Money.fromCents(summary?.salesTodayCents ?? 0).format()}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Orders Today</span>
          <span className="stat-value">{summary?.orderCountToday ?? 0}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Units Sold Today</span>
          <span className="stat-value">{summary?.unitsSoldToday ?? 0}</span>
        </div>
      </div>

      <div className="dashboard-panels">
        <div className="dashboard-panel">
          <h2>Last 7 Days</h2>
          <BarChart data={sevenDaySales} />
        </div>

        <div className="dashboard-panel">
          <h2>Top Products</h2>
          {topProducts.length === 0 ? (
            <p className="empty-hint">No sales yet</p>
          ) : (
            <ol className="top-products-list">
              {topProducts.map((product) => (
                <li key={product.productId}>
                  <span>{product.productName}</span>
                  <span>{product.totalQuantity} sold</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="dashboard-panel">
          <h2>Low Stock</h2>
          {lowStockProducts.length === 0 ? (
            <p className="empty-hint">Nothing low on stock</p>
          ) : (
            <ul className="low-stock-list">
              {lowStockProducts.map((product) => (
                <li key={product.id}>
                  <span>{product.name}</span>
                  <span className="badge badge-inactive">{product.stock} left</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
```

- [ ] **Step 13: Run the test to verify it passes**

Run: `npm test -- DashboardPage`
Expected: PASS, all 5 tests green.

- [ ] **Step 14: Run the full suite**

Run: `npm test`
Expected: PASS, no regressions.

- [ ] **Step 15: Commit**

```bash
git add src/renderer/src/features/dashboard/ src/renderer/src/assets/main.css
git commit -m "feat: add Dashboard screen (summary stats, 7-day chart, top products, low stock)"
```

---

### Task 6: Sales History screen — `useSalesHistory`, `SaleDetailModal`, `SalesHistoryPage`

**Files:**
- Create: `src/renderer/src/features/sales-history/useSalesHistory.ts`
- Test: `src/renderer/src/features/sales-history/useSalesHistory.test.ts`
- Create: `src/renderer/src/features/sales-history/SaleDetailModal.tsx`
- Test: `src/renderer/src/features/sales-history/SaleDetailModal.test.tsx`
- Create: `src/renderer/src/features/sales-history/SalesHistoryPage.tsx`
- Test: `src/renderer/src/features/sales-history/SalesHistoryPage.test.tsx`
- Modify: `src/renderer/src/assets/main.css`

**Interfaces:**
- Consumes: `window.api.salesHistory.*` (Task 4); `SaleListItem` from `src/shared/salesHistory.ts`; `SaleRecord` from `src/shared/sale.ts`; `Money` from `src/shared/money.ts`; `toUserMessage` from `src/renderer/src/lib/ipcError.ts`.
- Produces: `function useSalesHistory(): { sales: SaleListItem[]; loading: boolean; error: string | null; reload: () => Promise<void> }`; `SaleDetailModalProps { sale: SaleRecord; onClose: () => void }` (default export `SaleDetailModal`); default export `SalesHistoryPage` for Task 7 to render.

- [ ] **Step 1: Write the failing `useSalesHistory` tests**

```typescript
// src/renderer/src/features/sales-history/useSalesHistory.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useSalesHistory } from './useSalesHistory'
import type { SaleListItem } from '../../../../shared/salesHistory'

const list: SaleListItem[] = [
  { id: '1', billNumber: 1, totalCents: 4000, createdAt: '2026-09-03T10:00:00.000Z', itemCount: 2 }
]

describe('useSalesHistory', () => {
  beforeEach(() => {
    window.api = {
      dbHealth: vi.fn(),
      products: { list: vi.fn(), create: vi.fn(), update: vi.fn(), getByBarcode: vi.fn() },
      sales: { complete: vi.fn() },
      dashboard: { summary: vi.fn(), topProducts: vi.fn(), sevenDaySales: vi.fn(), lowStock: vi.fn() },
      salesHistory: {
        list: vi.fn().mockResolvedValue(list),
        detail: vi.fn()
      }
    } as unknown as Window['api']
  })

  it('loads the sales list on mount', async () => {
    const { result } = renderHook(() => useSalesHistory())
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sales).toEqual(list)
    expect(result.current.error).toBeNull()
  })

  it('surfaces a clean error message on failure', async () => {
    ;(window.api.salesHistory.list as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Error invoking remote method 'salesHistory:list': Something broke")
    )
    const { result } = renderHook(() => useSalesHistory())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Something broke')
  })

  it('reload() re-fetches the list', async () => {
    const { result } = renderHook(() => useSalesHistory())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const updated: SaleListItem[] = [...list, { id: '2', billNumber: 2, totalCents: 1000, createdAt: '2026-09-03T11:00:00.000Z', itemCount: 1 }]
    ;(window.api.salesHistory.list as ReturnType<typeof vi.fn>).mockResolvedValue(updated)

    await result.current.reload()

    await waitFor(() => expect(result.current.sales).toEqual(updated))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- useSalesHistory`
Expected: FAIL — `useSalesHistory.ts` does not exist yet.

- [ ] **Step 3: Implement `useSalesHistory`**

```typescript
// src/renderer/src/features/sales-history/useSalesHistory.ts
import { useCallback, useEffect, useState } from 'react'
import type { SaleListItem } from '../../../../shared/salesHistory'
import { toUserMessage } from '../../lib/ipcError'

export interface UseSalesHistoryResult {
  sales: SaleListItem[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

export function useSalesHistory(): UseSalesHistoryResult {
  const [sales, setSales] = useState<SaleListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const result = await window.api.salesHistory.list()
      setSales(result)
      setError(null)
    } catch (err) {
      setError(toUserMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload()
  }, [reload])

  return { sales, loading, error, reload }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- useSalesHistory`
Expected: PASS, all 3 tests green.

- [ ] **Step 5: Write the failing `SaleDetailModal` tests**

```typescript
// src/renderer/src/features/sales-history/SaleDetailModal.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SaleDetailModal from './SaleDetailModal'
import type { SaleRecord } from '../../../../shared/sale'

const sale: SaleRecord = {
  id: 'sale-1',
  totalCents: 6000,
  status: 'COMPLETED',
  createdAt: '2026-09-03T10:00:00.000Z',
  items: [
    { id: 'item-1', saleId: 'sale-1', productId: '1', productName: 'Coke', priceCents: 2000, quantity: 3, totalCents: 6000 }
  ]
}

describe('SaleDetailModal', () => {
  it('renders the line items and the total', () => {
    render(<SaleDetailModal sale={sale} onClose={vi.fn()} />)

    expect(screen.getByText('Coke')).toBeInTheDocument()
    expect(screen.getByText('฿20.00')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Total: ฿60.00')).toBeInTheDocument()
  })

  it('calls onClose when the Close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SaleDetailModal sale={sale} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SaleDetailModal sale={sale} onClose={onClose} />)

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test -- SaleDetailModal`
Expected: FAIL — `SaleDetailModal.tsx` does not exist yet.

- [ ] **Step 7: Implement `SaleDetailModal`**

```typescript
// src/renderer/src/features/sales-history/SaleDetailModal.tsx
import { useEffect } from 'react'
import type { SaleRecord } from '../../../../shared/sale'
import { Money } from '../../../../shared/money'

export interface SaleDetailModalProps {
  sale: SaleRecord
  onClose: () => void
}

function SaleDetailModal({ sale, onClose }: SaleDetailModalProps): React.JSX.Element {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="sale-detail-title">
        <h2 id="sale-detail-title">Sale Detail</h2>
        <p className="sale-detail-meta">{new Date(sale.createdAt).toLocaleString()}</p>

        <table className="products-table">
          <thead>
            <tr>
              <th>Product</th>
              <th className="col-price">Price</th>
              <th className="col-stock">Qty</th>
              <th className="col-price">Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id}>
                <td>{item.productName}</td>
                <td className="cell-price">{Money.fromCents(item.priceCents).format()}</td>
                <td className="cell-stock">{item.quantity}</td>
                <td className="cell-price">{Money.fromCents(item.totalCents).format()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="sale-detail-total">Total: {Money.fromCents(sale.totalCents).format()}</p>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default SaleDetailModal
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- SaleDetailModal`
Expected: PASS, all 3 tests green.

- [ ] **Step 9: Add the sales-history CSS**

Append to `src/renderer/src/assets/main.css`:

```css
/* ---- Sales History ---- */

.sale-detail-meta {
  color: var(--color-ink-muted);
  font-size: 13px;
}

.sale-detail-total {
  align-self: flex-end;
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 10: Write the failing `SalesHistoryPage` tests**

```typescript
// src/renderer/src/features/sales-history/SalesHistoryPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SalesHistoryPage from './SalesHistoryPage'
import type { SaleListItem } from '../../../../shared/salesHistory'
import type { SaleRecord } from '../../../../shared/sale'

const list: SaleListItem[] = [
  { id: 'sale-1', billNumber: 1, totalCents: 4000, createdAt: '2026-09-03T10:00:00.000Z', itemCount: 2 }
]

const detail: SaleRecord = {
  id: 'sale-1',
  totalCents: 4000,
  status: 'COMPLETED',
  createdAt: '2026-09-03T10:00:00.000Z',
  items: [
    { id: 'item-1', saleId: 'sale-1', productId: '1', productName: 'Coke', priceCents: 2000, quantity: 2, totalCents: 4000 }
  ]
}

describe('SalesHistoryPage', () => {
  beforeEach(() => {
    window.api = {
      dbHealth: vi.fn(),
      products: { list: vi.fn(), create: vi.fn(), update: vi.fn(), getByBarcode: vi.fn() },
      sales: { complete: vi.fn() },
      dashboard: { summary: vi.fn(), topProducts: vi.fn(), sevenDaySales: vi.fn(), lowStock: vi.fn() },
      salesHistory: {
        list: vi.fn().mockResolvedValue(list),
        detail: vi.fn().mockResolvedValue(detail)
      }
    } as unknown as Window['api']
  })

  it('renders the bill number, total, and item count for each sale', async () => {
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())
    expect(screen.getByText('฿40.00')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows an empty state when there are no sales', async () => {
    ;(window.api.salesHistory.list as ReturnType<typeof vi.fn>).mockResolvedValue([])
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('No sales yet')).toBeInTheDocument())
  })

  it('opens the detail modal with the line items when View is clicked', async () => {
    const user = userEvent.setup()
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'View' }))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.getByText('Coke')).toBeInTheDocument()
  })

  it('shows an error if the detail fetch fails', async () => {
    const user = userEvent.setup()
    ;(window.api.salesHistory.detail as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'))
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'View' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('boom'))
  })
})
```

- [ ] **Step 11: Run the test to verify it fails**

Run: `npm test -- SalesHistoryPage`
Expected: FAIL — `SalesHistoryPage.tsx` does not exist yet.

- [ ] **Step 12: Implement `SalesHistoryPage`**

```typescript
// src/renderer/src/features/sales-history/SalesHistoryPage.tsx
import { useState } from 'react'
import { useSalesHistory } from './useSalesHistory'
import SaleDetailModal from './SaleDetailModal'
import { Money } from '../../../../shared/money'
import type { SaleRecord } from '../../../../shared/sale'

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString()
}

function SalesHistoryPage(): React.JSX.Element {
  const { sales, loading, error } = useSalesHistory()
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

  async function handleView(saleId: string): Promise<void> {
    try {
      const found = await window.api.salesHistory.detail(saleId)
      if (found) {
        setSelectedSale(found)
        setDetailError(null)
      } else {
        setDetailError(`Sale ${saleId} was not found`)
      }
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="products-page">
      <div className="products-header">
        <h1>Sales History</h1>
      </div>

      {error && (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      )}
      {detailError && (
        <p role="alert" className="alert alert-danger">
          {detailError}
        </p>
      )}

      <div className="products-card">
        {loading ? (
          <div className="loading-row">
            <span className="spinner" aria-hidden="true" />
            Loading sales…
          </div>
        ) : sales.length === 0 ? (
          <div className="empty-state">
            <h2>No sales yet</h2>
            <p>Completed sales will show up here.</p>
          </div>
        ) : (
          <table className="products-table">
            <thead>
              <tr>
                <th>Bill #</th>
                <th>Date &amp; Time</th>
                <th className="col-price">Total</th>
                <th className="col-stock">Items</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id}>
                  <td>#{sale.billNumber}</td>
                  <td>{formatDateTime(sale.createdAt)}</td>
                  <td className="cell-price">{Money.fromCents(sale.totalCents).format()}</td>
                  <td className="cell-stock">{sale.itemCount}</td>
                  <td className="cell-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => handleView(sale.id)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedSale && <SaleDetailModal sale={selectedSale} onClose={() => setSelectedSale(null)} />}
    </div>
  )
}

export default SalesHistoryPage
```

- [ ] **Step 13: Run the test to verify it passes**

Run: `npm test -- SalesHistoryPage`
Expected: PASS, all 4 tests green.

- [ ] **Step 14: Run the full suite**

Run: `npm test`
Expected: PASS, no regressions.

- [ ] **Step 15: Commit**

```bash
git add src/renderer/src/features/sales-history/ src/renderer/src/assets/main.css
git commit -m "feat: add Sales History screen (bill list + line-item detail modal)"
```

---

### Task 7: Wire both new screens into `App.tsx`

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/App.test.tsx`

**Interfaces:**
- Consumes: default exports `DashboardPage` from `./features/dashboard/DashboardPage.tsx` (Task 5), `SalesHistoryPage` from `./features/sales-history/SalesHistoryPage.tsx` (Task 6).
- Produces: nothing new — this is the final integration point for the phase.

- [ ] **Step 1: Write the failing `App` tests**

Replace `src/renderer/src/App.test.tsx` with:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    window.api = {
      dbHealth: vi.fn(),
      products: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
        getByBarcode: vi.fn()
      },
      sales: {
        complete: vi.fn()
      },
      dashboard: {
        summary: vi.fn().mockResolvedValue({ salesTodayCents: 0, orderCountToday: 0, unitsSoldToday: 0 }),
        topProducts: vi.fn().mockResolvedValue([]),
        sevenDaySales: vi.fn().mockResolvedValue([]),
        lowStock: vi.fn().mockResolvedValue([])
      },
      salesHistory: {
        list: vi.fn().mockResolvedValue([]),
        detail: vi.fn()
      }
    } as unknown as Window['api']
  })

  it('shows the POS screen by default', () => {
    render(<App />)
    expect(screen.getByLabelText('Barcode')).toBeInTheDocument()
  })

  it('switches to the Products screen when its tab is clicked', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Products' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Product' })).toBeInTheDocument())
  })

  it('switches to the Dashboard screen when its tab is clicked', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Dashboard' }))

    await waitFor(() => expect(screen.getByText('Sales Today')).toBeInTheDocument())
  })

  it('switches to the Sales History screen when its tab is clicked', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Sales History' }))

    await waitFor(() => expect(screen.getByText('No sales yet')).toBeInTheDocument())
  })

  it('switches back to the POS screen', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Products' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Product' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'POS' }))

    await waitFor(() => expect(screen.getByLabelText('Barcode')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npm test -- App`
Expected: FAIL — no "Dashboard"/"Sales History" tabs yet.

- [ ] **Step 3: Implement the `App.tsx` changes**

```typescript
// src/renderer/src/App.tsx
import { useState } from 'react'
import ProductsPage from './features/products/ProductsPage'
import PosPage from './features/cart/PosPage'
import DashboardPage from './features/dashboard/DashboardPage'
import SalesHistoryPage from './features/sales-history/SalesHistoryPage'

type Tab = 'pos' | 'products' | 'dashboard' | 'salesHistory'

function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('pos')

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <button
          type="button"
          className={`nav-tab ${tab === 'pos' ? 'is-active' : ''}`}
          onClick={() => setTab('pos')}
        >
          POS
        </button>
        <button
          type="button"
          className={`nav-tab ${tab === 'products' ? 'is-active' : ''}`}
          onClick={() => setTab('products')}
        >
          Products
        </button>
        <button
          type="button"
          className={`nav-tab ${tab === 'dashboard' ? 'is-active' : ''}`}
          onClick={() => setTab('dashboard')}
        >
          Dashboard
        </button>
        <button
          type="button"
          className={`nav-tab ${tab === 'salesHistory' ? 'is-active' : ''}`}
          onClick={() => setTab('salesHistory')}
        >
          Sales History
        </button>
      </nav>
      <div className="app-content">
        {tab === 'pos' && <PosPage />}
        {tab === 'products' && <ProductsPage />}
        {tab === 'dashboard' && <DashboardPage />}
        {tab === 'salesHistory' && <SalesHistoryPage />}
      </div>
    </div>
  )
}

export default App
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- App`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Run the full suite, lint, and typecheck**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS, no new issues.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/App.test.tsx
git commit -m "feat: add Dashboard and Sales History tabs to the app shell"
```

---

## Definition of Done

- `npm test` passes in full (existing 118 tests + all new tests from this plan).
- `npm run lint` and `npm run typecheck` pass with no new issues.
- The Dashboard tab shows today's sales total, order count, and units sold; a 7-day sales bar chart; a top-products leaderboard; and a low-stock list — all reading from the real `sales`/`sale_items`/`stock_transactions`/`products` tables Phase 4 already writes to.
- Completing a sale on POS and then switching to the Dashboard tab shows the updated totals (spec §14.1's named critical test case), because switching tabs remounts `DashboardPage` and triggers a fresh fetch.
- The Sales History tab lists every completed sale with a sequential bill number, date/time, and total, newest first; clicking "View" opens a modal with that sale's line items and its own total.
- Every write path from Phase 4 remains untouched — this phase is read-only against the schema (aside from the one new index).

## What this phase doesn't cover

- **A configurable low-stock threshold or dashboard date-range picker** — the spec's §12 mentions a "selected period" for Order Count and a "configured threshold" for Low Stock; this MVP phase hardcodes "today" and a threshold of 5 respectively (both function parameters with defaults, so a future settings screen can pass different values without changing the repository layer).
- **Live-updating dashboard while the tab is open** — the dashboard reflects the latest data on every tab switch (remount), not while sitting open during a sale on another tab. Matches the spec's "reflects new totals after a successful sale," not a live-polling requirement it doesn't ask for.
- **Printing or exporting sales history / receipts** — spec's Printer Service (§10.2) is explicitly deferred (P1, not MVP).
- **Sale cancellation/void** — spec §6.4 explicitly puts this out of MVP scope; Sales History is read-only.
- **Windows packaging / installer** — that's Phase 6.
