# Phase 11: Dashboard Analytics Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Dashboard page per `docs/superpowers/specs/2026-09-05-pos-enhancements-design.md`'s Phase 11 section: four stat cards (Total Sales, Total Orders, Avg Order Value, Units Sold) each showing a "+X% vs previous period" indicator, a single sales chart toggled between "Today" (hourly) and "7 Days" (daily) views by one dropdown that also drives the stat cards, and a new Sales by Payment Method donut chart scoped to the same period. Top Products and Low Stock are unchanged from Phase 5.

**Architecture:** No schema changes — every number this phase needs already exists in `sales`/`sale_items` (including `paymentMethod` from Phase 8 and `status` from Phase 10). The existing `dashboard-repository.ts` is rewritten around one shared concept, a **period window**: `'today'` means today vs. yesterday; `'7days'` means the trailing 7 local calendar days vs. the 7 immediately before that. `getDashboardSummary`/`getSevenDaySales` are replaced by `getDashboardStats` (current + previous period stats, for the cards) and `getSalesChartData` (a `ChartBucket[]` — `{label, totalCents}` — for either an hourly or a daily breakdown), plus a new `getPaymentMethodBreakdown` (current-period-only, grouped by `paymentMethod`). `getTopProducts`/`getLowStockProducts` are untouched. On the renderer side, `BarChart` is generalized from `DailySales[]` to the period-agnostic `ChartBucket[]` shape — the bar-rendering mechanism (hand-rolled SVG, no charting library) carries forward unchanged, but the label is now supplied pre-formatted by the repository rather than parsed from a date string inside the component, since the same component must now render both weekday labels and hour labels. A new `DonutChart` component (also hand-rolled SVG, using the standard `stroke-dasharray`/`stroke-dashoffset` ring-segment technique) renders the payment-method breakdown. `useDashboard` gains a `period` state that re-fetches the three period-scoped endpoints (stats, chart data, payment breakdown) on change, while Top Products/Low Stock load once and stay period-independent.

**Tech Stack:** Same as the rest of the app — Electron main process, Drizzle ORM/better-sqlite3, React 19 renderer, Vitest + React Testing Library. No new dependencies.

## Global Constraints

- Every write path gets a test in the same task; assert real outcomes against a real SQLite DB or real rendered DOM — no "it didn't throw" tests. (This phase is entirely reads — the same real-assertion bar applies to every query and every rendered value.)
- The renderer never imports `better-sqlite3`/`drizzle-orm`/`electron`'s main-process APIs, or anything under `src/main/**` — everything crosses `window.api`.
- Money is always an integer number of satang through the `Money` class — never raw `+`/`-`/`*` on a `cents` number. The one exception this phase introduces deliberately: an *average* (`salesCents ÷ orderCount`) and a *growth percentage* (`(current − previous) ÷ previous × 100`) are not currency values being combined with other currency values — `Money` has no `divide` method — so these are computed with plain arithmetic, guarded against division by zero, and the *result* of the average is still wrapped in `Money.fromCents(...)` before it's ever displayed.
- "Today" and any calendar-day boundary always means the shop's **local** calendar day, not the UTC day `created_at` is stored in — matching every existing dashboard/date-filter boundary already in this codebase (`dashboard-repository.ts`'s `startOfDay`, `BarChart.tsx`'s `parseDateOnlyLocal`, `SalesHistoryPage.tsx`'s `toLocalDay`).
- `sales.status` is the `SaleStatus` union (`'COMPLETED' | 'VOID'`) from `src/shared/sale.ts` — every stat, chart bucket, and payment-method total in this phase counts `'COMPLETED'` sales only, so a voided sale contributes nothing anywhere on the Dashboard (matching the existing behavior Phase 10's final review already verified for the pre-existing three aggregations).
- `PAYMENT_METHODS`/`PaymentMethod` (the closed union in `src/shared/sale.ts`) is the only source of truth for payment methods — never re-hardcode the three literal strings.

## File Structure

- Modify: `src/shared/dashboard.ts` — replace `DashboardSummary`/`DailySales` with `DashboardPeriod`, `PeriodStats`, `DashboardStats`, `ChartBucket`, `PaymentMethodBreakdown`; `TopProduct` is unchanged.
- Modify: `src/main/database/repositories/dashboard-repository.ts` (+ test) — `getDashboardStats`, `getSalesChartData`, `getPaymentMethodBreakdown` replace `getDashboardSummary`/`getSevenDaySales`; `getTopProducts`/`getLowStockProducts` untouched.
- Modify: `src/main/ipc/register-dashboard-handlers.ts` (+ test) — `dashboard:stats`, `dashboard:chartData`, `dashboard:paymentBreakdown` replace `dashboard:summary`/`dashboard:sevenDaySales`.
- Modify: `src/preload/index.ts`, `src/preload/index.d.ts` — mirror the new channels.
- Modify: `src/renderer/src/features/dashboard/useDashboard.ts` (+ test) — `period` state, re-fetch on change.
- Modify: `src/renderer/src/features/dashboard/BarChart.tsx` (+ test) — generalized to `ChartBucket[]`.
- Create: `src/renderer/src/features/dashboard/DonutChart.tsx` (+ test) — the new payment-method chart.
- Modify: `src/renderer/src/features/dashboard/DashboardPage.tsx` (+ test) — period dropdown, four stat cards with growth indicators, the 2×2 panel layout.
- Modify: `src/renderer/src/assets/base.css` — three new chart color tokens.
- Modify: `src/renderer/src/assets/main.css` — stat-growth styles, 4-column stat grid, 2×2 panel grid, donut chart styles.

---

### Task 1: Shared types and the dashboard repository

**Files:**
- Modify: `src/shared/dashboard.ts`
- Modify: `src/main/database/repositories/dashboard-repository.ts`
- Test: `src/main/database/repositories/dashboard-repository.test.ts`

**Interfaces:**
- Produces: `DashboardPeriod = 'today' | '7days'`; `PeriodStats { salesCents, orderCount, unitsSold, avgOrderValueCents }`; `DashboardStats { current: PeriodStats, previous: PeriodStats }`; `ChartBucket { label: string, totalCents: number }`; `PaymentMethodBreakdown { paymentMethod: PaymentMethod, totalCents: number, count: number }`; `getDashboardStats(db, period, referenceDate?): DashboardStats`; `getSalesChartData(db, period, referenceDate?): ChartBucket[]`; `getPaymentMethodBreakdown(db, period, referenceDate?): PaymentMethodBreakdown[]` — Task 2 (IPC) calls these four exact signatures. `getTopProducts`/`getLowStockProducts` keep their existing signatures unchanged.

- [ ] **Step 1: Replace the shared dashboard types**

Replace the full contents of `src/shared/dashboard.ts`:

```typescript
import type { PaymentMethod } from './sale'

export type DashboardPeriod = 'today' | '7days'

export interface PeriodStats {
  salesCents: number
  orderCount: number
  unitsSold: number
  avgOrderValueCents: number
}

export interface DashboardStats {
  current: PeriodStats
  previous: PeriodStats
}

export interface ChartBucket {
  label: string
  totalCents: number
}

export interface PaymentMethodBreakdown {
  paymentMethod: PaymentMethod
  totalCents: number
  count: number
}

export interface TopProduct {
  productId: string
  productName: string
  totalQuantity: number
  totalRevenueCents: number
}
```

- [ ] **Step 2: Write the failing repository tests**

Replace the full contents of `src/main/database/repositories/dashboard-repository.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const isMock = vi.hoisted(() => ({ dev: true }))
vi.mock('@electron-toolkit/utils', () => ({ is: isMock }))
vi.mock('electron', () => ({ app: { getPath: vi.fn() } }))

import { createDbClient, type DbClient } from '../client'
import { sales, saleItems } from '../schema'
import { createProduct, updateProduct } from './product-repository'
import { completeSale } from './sale-repository'
import {
  getDashboardStats,
  getSalesChartData,
  getPaymentMethodBreakdown,
  getLowStockProducts,
  getTopProducts
} from './dashboard-repository'
import type { SaleLineInput } from '../../../shared/sale'

function daysAgoIso(days: number, hour = 12): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

function insertRawSale(
  client: DbClient,
  id: string,
  totalCents: number,
  createdAt: string,
  status: 'COMPLETED' | 'VOID' = 'COMPLETED',
  paymentMethod: 'CASH' | 'QR' | 'CARD' = 'CASH'
): void {
  client.db.insert(sales).values({ id, totalCents, status, paymentMethod, createdAt }).run()
}

describe('getDashboardStats', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-dashboard-stats-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it("'today': returns zeros for both periods when there are no sales at all", () => {
    const result = getDashboardStats(client.db, 'today')
    expect(result).toEqual({
      current: { salesCents: 0, orderCount: 0, unitsSold: 0, avgOrderValueCents: 0 },
      previous: { salesCents: 0, orderCount: 0, unitsSold: 0, avgOrderValueCents: 0 }
    })
  })

  it("'today': current is today's sales, previous is yesterday's, computed correctly with an average", () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    const line: SaleLineInput = {
      productId: coke.id,
      productName: coke.name,
      unitPriceCents: coke.priceCents,
      quantity: 2
    }
    completeSale(client.db, [line], 'CASH') // today, 4000 cents, 2 units
    completeSale(client.db, [line], 'CASH') // today, 4000 cents, 2 units
    insertRawSale(client, 'yesterday-sale', 3000, daysAgoIso(1))

    const result = getDashboardStats(client.db, 'today')
    expect(result.current).toEqual({
      salesCents: 8000,
      orderCount: 2,
      unitsSold: 4,
      avgOrderValueCents: 4000
    })
    expect(result.previous).toEqual({
      salesCents: 3000,
      orderCount: 1,
      unitsSold: 0,
      avgOrderValueCents: 3000
    })
  })

  it("'today': avgOrderValueCents is 0 when a period has no orders, not a division error", () => {
    const result = getDashboardStats(client.db, 'today')
    expect(result.current.avgOrderValueCents).toBe(0)
    expect(result.previous.avgOrderValueCents).toBe(0)
  })

  it("'today': excludes sales whose status is not COMPLETED", () => {
    insertRawSale(client, 'void-sale', 5000, new Date().toISOString(), 'VOID')
    const result = getDashboardStats(client.db, 'today')
    expect(result.current.salesCents).toBe(0)
    expect(result.current.orderCount).toBe(0)
  })

  it("'7days': current is the trailing 7 local days, previous is the 7 immediately before", () => {
    insertRawSale(client, 'today-sale', 1000, daysAgoIso(0))
    insertRawSale(client, 'six-days-ago', 2000, daysAgoIso(6))
    insertRawSale(client, 'seven-days-ago', 9999, daysAgoIso(7))
    insertRawSale(client, 'thirteen-days-ago', 3000, daysAgoIso(13))
    insertRawSale(client, 'fourteen-days-ago', 9999, daysAgoIso(14))

    const result = getDashboardStats(client.db, '7days')
    // Current window: days 0-6 ago -> today-sale + six-days-ago = 3000
    expect(result.current.salesCents).toBe(3000)
    expect(result.current.orderCount).toBe(2)
    // Previous window: days 7-13 ago -> seven-days-ago + thirteen-days-ago = 12999
    expect(result.previous.salesCents).toBe(12999)
    expect(result.previous.orderCount).toBe(2)
  })

  it("buckets 'today' by the local calendar day, not the UTC calendar day", () => {
    const referenceDate = new Date()
    const offsetMinutes = referenceDate.getTimezoneOffset()
    if (offsetMinutes === 0) {
      // No local/UTC distinction exists to test on a UTC-clocked machine.
      return
    }

    const localStart = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate()
    )
    const utcStart = new Date(
      Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate())
    )
    if (localStart.getTime() === utcStart.getTime()) {
      return
    }

    const laterBoundary = Math.max(localStart.getTime(), utcStart.getTime())
    const testInstant = new Date(laterBoundary - 1)
    insertRawSale(client, 'tz-boundary-sale', 9999, testInstant.toISOString())

    const expectedIncluded = testInstant.getTime() >= localStart.getTime()
    const result = getDashboardStats(client.db, 'today', referenceDate)
    expect(result.current.salesCents).toBe(expectedIncluded ? 9999 : 0)
  })
})

describe('getSalesChartData', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-dashboard-chart-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it("'today': returns exactly 24 hourly buckets, all zero when there are no sales", () => {
    const result = getSalesChartData(client.db, 'today')
    expect(result).toHaveLength(24)
    expect(result.every((bucket) => bucket.totalCents === 0)).toBe(true)
  })

  it("'today': places a sale in the bucket matching its local hour", () => {
    const referenceDate = new Date()
    const nineAm = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate(),
      9,
      30
    )
    insertRawSale(client, 'nine-am-sale', 1500, nineAm.toISOString())

    const result = getSalesChartData(client.db, 'today', referenceDate)
    expect(result[9].totalCents).toBe(1500)
    expect(result.filter((b) => b.totalCents > 0)).toHaveLength(1)
  })

  it("'today': labels each hourly bucket using the local hour, not UTC", () => {
    const referenceDate = new Date(2026, 8, 5)
    const expectedHour3Label = new Date(2026, 8, 5, 3).toLocaleTimeString(undefined, {
      hour: 'numeric'
    })
    const result = getSalesChartData(client.db, 'today', referenceDate)
    expect(result[3].label).toBe(expectedHour3Label)
  })

  it("'7days': returns exactly 7 daily buckets, oldest first, matching getDashboardStats' current window", () => {
    insertRawSale(client, 'today-sale', 1500, daysAgoIso(0))
    insertRawSale(client, 'six-days-ago', 2500, daysAgoIso(6))
    insertRawSale(client, 'seven-days-ago', 9999, daysAgoIso(7))

    const result = getSalesChartData(client.db, '7days')
    expect(result).toHaveLength(7)
    expect(result[6].totalCents).toBe(1500) // today is the last bucket
    expect(result[0].totalCents).toBe(2500) // 6 days ago is the first bucket
    expect(result.reduce((sum, b) => sum + b.totalCents, 0)).toBe(4000) // 7-days-ago excluded
  })

  it("'7days': labels each bucket with its local weekday, not UTC", () => {
    const referenceDate = new Date(2026, 8, 5) // a Saturday
    const expectedLastLabel = new Date(2026, 8, 5).toLocaleDateString(undefined, {
      weekday: 'short'
    })
    const result = getSalesChartData(client.db, '7days', referenceDate)
    expect(result[6].label).toBe(expectedLastLabel)
  })
})

describe('getPaymentMethodBreakdown', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-dashboard-paymentbreakdown-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('returns an empty array when there are no sales in the period', () => {
    expect(getPaymentMethodBreakdown(client.db, 'today')).toEqual([])
  })

  it('groups by payment method, summing totals and counting orders, ordered by total descending', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    const line: SaleLineInput = {
      productId: coke.id,
      productName: coke.name,
      unitPriceCents: coke.priceCents,
      quantity: 1
    }
    completeSale(client.db, [line], 'CASH') // 2000
    completeSale(client.db, [line], 'CASH') // 2000
    completeSale(client.db, [line], 'QR') // 2000
    completeSale(client.db, [{ ...line, quantity: 5 }], 'CARD') // 10000

    const result = getPaymentMethodBreakdown(client.db, 'today')
    expect(result).toEqual([
      { paymentMethod: 'CARD', totalCents: 10000, count: 1 },
      { paymentMethod: 'CASH', totalCents: 4000, count: 2 },
      { paymentMethod: 'QR', totalCents: 2000, count: 1 }
    ])
  })

  it('excludes VOID sales from the breakdown', () => {
    insertRawSale(client, 'void-sale', 5000, new Date().toISOString(), 'VOID', 'QR')
    expect(getPaymentMethodBreakdown(client.db, 'today')).toEqual([])
  })

  it("is scoped to the current period only, matching getDashboardStats' current window", () => {
    insertRawSale(client, 'yesterday-sale', 5000, daysAgoIso(1), 'COMPLETED', 'QR')
    expect(getPaymentMethodBreakdown(client.db, 'today')).toEqual([])
    const sevenDayResult = getPaymentMethodBreakdown(client.db, '7days')
    expect(sevenDayResult).toEqual([{ paymentMethod: 'QR', totalCents: 5000, count: 1 }])
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
    ], 'CASH')
    completeSale(client.db, [
      { productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 5 }
    ], 'CASH')

    const top = getTopProducts(client.db)
    expect(top[0]).toMatchObject({ productId: water.id, productName: 'Water', totalQuantity: 5, totalRevenueCents: 5000 })
    expect(top[1]).toMatchObject({ productId: coke.id, productName: 'Coke', totalQuantity: 2, totalRevenueCents: 4000 })
  })

  it('sums quantity across multiple sales of the same product', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 2 }
    ], 'CASH')
    completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 3 }
    ], 'CASH')

    const top = getTopProducts(client.db)
    expect(top).toHaveLength(1)
    expect(top[0].totalQuantity).toBe(5)
  })

  it('respects the limit', () => {
    const a = createProduct(client.db, { barcode: '1', name: 'A', priceCents: 100, stock: 50 })
    const b = createProduct(client.db, { barcode: '2', name: 'B', priceCents: 100, stock: 50 })
    const c = createProduct(client.db, { barcode: '3', name: 'C', priceCents: 100, stock: 50 })
    completeSale(client.db, [{ productId: a.id, productName: a.name, unitPriceCents: 100, quantity: 3 }], 'CASH')
    completeSale(client.db, [{ productId: b.id, productName: b.name, unitPriceCents: 100, quantity: 2 }], 'CASH')
    completeSale(client.db, [{ productId: c.id, productName: c.name, unitPriceCents: 100, quantity: 1 }], 'CASH')

    const top = getTopProducts(client.db, 2)
    expect(top).toHaveLength(2)
    expect(top.map((p) => p.productId)).toEqual([a.id, b.id])
  })

  it('returns an empty array when there are no sales', () => {
    expect(getTopProducts(client.db)).toEqual([])
  })
})
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `npx vitest run src/main/database/repositories/dashboard-repository.test.ts`
Expected: FAIL — `getDashboardStats`, `getSalesChartData`, `getPaymentMethodBreakdown` are not exported yet (the `getLowStockProducts`/`getTopProducts` describe blocks still pass, since those functions are untouched).

- [ ] **Step 4: Rewrite the repository**

Replace the full contents of `src/main/database/repositories/dashboard-repository.ts`:

```typescript
import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { products, sales, saleItems } from '../schema'
import type {
  DashboardPeriod,
  DashboardStats,
  PeriodStats,
  ChartBucket,
  PaymentMethodBreakdown,
  TopProduct
} from '../../../shared/dashboard'
import type { ProductRecord } from '../../../shared/product'
import type { PaymentMethod } from '../../../shared/sale'
import { Money } from '../../../shared/money'

// Computed with the local (OS) timezone deliberately — created_at is stored
// as UTC, but every period boundary below must mean the shop's local
// calendar day, not a UTC day.
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

interface PeriodWindow {
  currentStart: Date
  currentEnd: Date
  previousStart: Date
  previousEnd: Date
}

function getPeriodWindow(period: DashboardPeriod, referenceDate: Date): PeriodWindow {
  const todayStart = startOfDay(referenceDate)

  if (period === 'today') {
    return {
      currentStart: todayStart,
      currentEnd: addDays(todayStart, 1),
      previousStart: addDays(todayStart, -1),
      previousEnd: todayStart
    }
  }

  // '7days': the 7 local calendar days ending today (inclusive), vs. the 7
  // immediately before that window.
  const currentStart = addDays(todayStart, -6)
  return {
    currentStart,
    currentEnd: addDays(todayStart, 1),
    previousStart: addDays(currentStart, -7),
    previousEnd: currentStart
  }
}

function getPeriodStats(db: BetterSQLite3Database, start: Date, end: Date): PeriodStats {
  const windowSales = db
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

  const salesCents = windowSales
    .reduce((total, sale) => total.add(Money.fromCents(sale.totalCents)), Money.fromCents(0))
    .cents

  let unitsSold = 0
  if (windowSales.length > 0) {
    const saleIds = windowSales.map((sale) => sale.id)
    const items = db.select().from(saleItems).where(inArray(saleItems.saleId, saleIds)).all()
    unitsSold = items.reduce((sum, item) => sum + item.quantity, 0)
  }

  const orderCount = windowSales.length
  const avgOrderValueCents = orderCount > 0 ? Math.round(salesCents / orderCount) : 0

  return { salesCents, orderCount, unitsSold, avgOrderValueCents }
}

export function getDashboardStats(
  db: BetterSQLite3Database,
  period: DashboardPeriod,
  referenceDate: Date = new Date()
): DashboardStats {
  const window = getPeriodWindow(period, referenceDate)
  return {
    current: getPeriodStats(db, window.currentStart, window.currentEnd),
    previous: getPeriodStats(db, window.previousStart, window.previousEnd)
  }
}

export function getSalesChartData(
  db: BetterSQLite3Database,
  period: DashboardPeriod,
  referenceDate: Date = new Date()
): ChartBucket[] {
  if (period === 'today') {
    const dayStart = startOfDay(referenceDate)
    const buckets: ChartBucket[] = []
    for (let hour = 0; hour < 24; hour++) {
      const start = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(), hour)
      const end = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(), hour + 1)
      const stats = getPeriodStats(db, start, end)
      buckets.push({
        label: start.toLocaleTimeString(undefined, { hour: 'numeric' }),
        totalCents: stats.salesCents
      })
    }
    return buckets
  }

  // '7days'
  const buckets: ChartBucket[] = []
  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const start = addDays(startOfDay(referenceDate), -daysAgo)
    const end = addDays(start, 1)
    const stats = getPeriodStats(db, start, end)
    buckets.push({
      label: start.toLocaleDateString(undefined, { weekday: 'short' }),
      totalCents: stats.salesCents
    })
  }
  return buckets
}

export function getPaymentMethodBreakdown(
  db: BetterSQLite3Database,
  period: DashboardPeriod,
  referenceDate: Date = new Date()
): PaymentMethodBreakdown[] {
  const window = getPeriodWindow(period, referenceDate)

  const rows = db
    .select({
      paymentMethod: sales.paymentMethod,
      totalCents: sql<number>`SUM(${sales.totalCents})`,
      count: sql<number>`COUNT(*)`
    })
    .from(sales)
    .where(
      and(
        eq(sales.status, 'COMPLETED'),
        gte(sales.createdAt, window.currentStart.toISOString()),
        lt(sales.createdAt, window.currentEnd.toISOString())
      )
    )
    .groupBy(sales.paymentMethod)
    .orderBy(desc(sql`SUM(${sales.totalCents})`))
    .all()

  return rows.map((row) => ({
    paymentMethod: row.paymentMethod as PaymentMethod,
    totalCents: row.totalCents,
    count: row.count
  }))
}

export function getLowStockProducts(
  db: BetterSQLite3Database,
  threshold: number = 5
): ProductRecord[] {
  return db
    .select()
    .from(products)
    .where(and(eq(products.isActive, true), sql`${products.stock} <= ${threshold}`))
    .orderBy(asc(products.stock))
    .all() as ProductRecord[]
}

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
```

Note: `getLowStockProducts` is reproduced here with its `lte(products.stock, threshold)` call rewritten as `sql\`${products.stock} <= ${threshold}\`` only because `lte` is no longer imported (this file no longer needs it elsewhere — `getPeriodStats`/`getSalesChartData` use `gte`/`lt`, not `lte`). Behavior is identical; if the implementer prefers, `lte` can simply stay imported and the original `lte(products.stock, threshold)` call kept verbatim instead — either is correct, pick whichever keeps the diff smaller.

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `npx vitest run src/main/database/repositories/dashboard-repository.test.ts`
Expected: PASS — all tests in all four describe blocks.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: fails only on files not yet updated by this task (Task 2's IPC handlers, Task 3/4's renderer files, which still reference the old `DashboardSummary`/`DailySales` types and the old repository function names) — confirm the failures are limited to those not-yet-touched files, not to anything in this task's own two files.

- [ ] **Step 7: Commit**

```bash
git add src/shared/dashboard.ts src/main/database/repositories/dashboard-repository.ts src/main/database/repositories/dashboard-repository.test.ts
git commit -m "feat: rewrite dashboard repository around period-aware stats, chart data, and payment breakdown"
```

---

### Task 2: IPC handlers and preload

**Files:**
- Modify: `src/main/ipc/register-dashboard-handlers.ts`
- Test: `src/main/ipc/register-dashboard-handlers.test.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

**Interfaces:**
- Consumes: `getDashboardStats`, `getSalesChartData`, `getPaymentMethodBreakdown`, `getTopProducts`, `getLowStockProducts` from Task 1's `dashboard-repository.ts`; `DashboardPeriod`, `DashboardStats`, `ChartBucket`, `PaymentMethodBreakdown`, `TopProduct` from Task 1's `shared/dashboard.ts`.
- Produces: IPC channels `dashboard:stats`, `dashboard:chartData`, `dashboard:paymentBreakdown`, `dashboard:topProducts`, `dashboard:lowStock`; `window.api.dashboard.{stats, chartData, paymentBreakdown, topProducts, lowStock}` — Task 3's `useDashboard` hook calls these five exact functions.

- [ ] **Step 1: Write the failing IPC handler tests**

Replace the full contents of `src/main/ipc/register-dashboard-handlers.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const handlers = new Map<string, (...args: unknown[]) => unknown>()
const isMock = vi.hoisted(() => ({ dev: true }))

vi.mock('@electron-toolkit/utils', () => ({ is: isMock }))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener)
    }
  },
  app: { getPath: vi.fn() }
}))

import { registerDashboardHandlers } from './register-dashboard-handlers'
import { createDbClient, type DbClient } from '../database/client'
import { createProduct } from '../database/repositories/product-repository'
import { completeSale } from '../database/repositories/sale-repository'
import type { DashboardStats, ChartBucket, PaymentMethodBreakdown } from '../../shared/dashboard'

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

  it('registers all five dashboard channels', () => {
    expect(handlers.has('dashboard:stats')).toBe(true)
    expect(handlers.has('dashboard:chartData')).toBe(true)
    expect(handlers.has('dashboard:paymentBreakdown')).toBe(true)
    expect(handlers.has('dashboard:topProducts')).toBe(true)
    expect(handlers.has('dashboard:lowStock')).toBe(true)
  })

  it("dashboard:stats reflects a completed sale for period 'today'", () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 2 }
    ], 'CASH')

    const statsHandler = handlers.get('dashboard:stats')!
    const stats = statsHandler({}, 'today') as DashboardStats
    expect(stats.current).toEqual({
      salesCents: 4000,
      orderCount: 1,
      unitsSold: 2,
      avgOrderValueCents: 4000
    })
  })

  it("dashboard:chartData returns 24 buckets for 'today' and 7 for '7days'", () => {
    const chartDataHandler = handlers.get('dashboard:chartData')!
    expect((chartDataHandler({}, 'today') as ChartBucket[])).toHaveLength(24)
    expect((chartDataHandler({}, '7days') as ChartBucket[])).toHaveLength(7)
  })

  it('dashboard:paymentBreakdown reflects a completed sale', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 }
    ], 'QR')

    const breakdownHandler = handlers.get('dashboard:paymentBreakdown')!
    const result = breakdownHandler({}, 'today') as PaymentMethodBreakdown[]
    expect(result).toEqual([{ paymentMethod: 'QR', totalCents: 2000, count: 1 }])
  })

  it('dashboard:topProducts passes a given limit through', () => {
    const a = createProduct(client.db, { barcode: '1', name: 'A', priceCents: 100, stock: 50 })
    const b = createProduct(client.db, { barcode: '2', name: 'B', priceCents: 100, stock: 50 })
    completeSale(client.db, [{ productId: a.id, productName: a.name, unitPriceCents: 100, quantity: 2 }], 'CASH')
    completeSale(client.db, [{ productId: b.id, productName: b.name, unitPriceCents: 100, quantity: 1 }], 'CASH')

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

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run src/main/ipc/register-dashboard-handlers.test.ts`
Expected: FAIL — the old channels (`dashboard:summary`, `dashboard:sevenDaySales`) are still registered instead of the new ones.

- [ ] **Step 3: Rewrite the IPC handlers**

Replace the full contents of `src/main/ipc/register-dashboard-handlers.ts`:

```typescript
import { ipcMain } from 'electron'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import {
  getDashboardStats,
  getSalesChartData,
  getPaymentMethodBreakdown,
  getTopProducts,
  getLowStockProducts
} from '../database/repositories/dashboard-repository'
import type {
  DashboardPeriod,
  DashboardStats,
  ChartBucket,
  PaymentMethodBreakdown,
  TopProduct
} from '../../shared/dashboard'
import type { ProductRecord } from '../../shared/product'

export function registerDashboardHandlers(db: BetterSQLite3Database): void {
  ipcMain.handle('dashboard:stats', (_event, period: DashboardPeriod): DashboardStats => {
    return getDashboardStats(db, period)
  })

  ipcMain.handle('dashboard:chartData', (_event, period: DashboardPeriod): ChartBucket[] => {
    return getSalesChartData(db, period)
  })

  ipcMain.handle(
    'dashboard:paymentBreakdown',
    (_event, period: DashboardPeriod): PaymentMethodBreakdown[] => {
      return getPaymentMethodBreakdown(db, period)
    }
  )

  ipcMain.handle('dashboard:topProducts', (_event, limit?: number): TopProduct[] => {
    return getTopProducts(db, limit)
  })

  ipcMain.handle('dashboard:lowStock', (_event, threshold?: number): ProductRecord[] => {
    return getLowStockProducts(db, threshold)
  })
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run src/main/ipc/register-dashboard-handlers.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the preload implementation**

In `src/preload/index.ts`, change the import on line 6 from:

```typescript
import type { DashboardSummary, TopProduct, DailySales } from '../shared/dashboard'
```

to:

```typescript
import type {
  DashboardPeriod,
  DashboardStats,
  ChartBucket,
  PaymentMethodBreakdown,
  TopProduct
} from '../shared/dashboard'
```

Then replace the `dashboard` block inside the `api` object:

```typescript
  dashboard: {
    stats: (period: DashboardPeriod): Promise<DashboardStats> =>
      ipcRenderer.invoke('dashboard:stats', period),
    chartData: (period: DashboardPeriod): Promise<ChartBucket[]> =>
      ipcRenderer.invoke('dashboard:chartData', period),
    paymentBreakdown: (period: DashboardPeriod): Promise<PaymentMethodBreakdown[]> =>
      ipcRenderer.invoke('dashboard:paymentBreakdown', period),
    topProducts: (limit?: number): Promise<TopProduct[]> =>
      ipcRenderer.invoke('dashboard:topProducts', limit),
    lowStock: (threshold?: number): Promise<ProductRecord[]> =>
      ipcRenderer.invoke('dashboard:lowStock', threshold)
  },
```

- [ ] **Step 6: Update the preload type declarations**

In `src/preload/index.d.ts`, change the import on line 5 the same way as Step 5, then replace the `dashboard` block inside `Window['api']`:

```typescript
      dashboard: {
        stats: (period: DashboardPeriod) => Promise<DashboardStats>
        chartData: (period: DashboardPeriod) => Promise<ChartBucket[]>
        paymentBreakdown: (period: DashboardPeriod) => Promise<PaymentMethodBreakdown[]>
        topProducts: (limit?: number) => Promise<TopProduct[]>
        lowStock: (threshold?: number) => Promise<ProductRecord[]>
      }
```

- [ ] **Step 7: Full suite, typecheck, lint**

Run: `npm test` — expect the same pattern as Task 1's Step 6 (only not-yet-updated renderer files fail typecheck; all *tests* that don't touch those files still pass since nothing runtime-breaks until those files are actually imported by a running test — if any renderer test unexpectedly fails at runtime rather than just typecheck, stop and investigate before continuing, since that would mean something is more broken than "types not updated yet").
Run: `npm run typecheck` — same expectation as Task 1 Step 6, narrowed to exclude this task's own four files now.

- [ ] **Step 8: Commit**

```bash
git add src/main/ipc/register-dashboard-handlers.ts src/main/ipc/register-dashboard-handlers.test.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat: expose period-aware dashboard stats, chart data, and payment breakdown over IPC"
```

---

### Task 3: `useDashboard` hook and the generalized `BarChart`

**Files:**
- Modify: `src/renderer/src/features/dashboard/useDashboard.ts`
- Test: `src/renderer/src/features/dashboard/useDashboard.test.ts`
- Modify: `src/renderer/src/features/dashboard/BarChart.tsx`
- Test: `src/renderer/src/features/dashboard/BarChart.test.tsx`

**Interfaces:**
- Consumes: `window.api.dashboard.{stats, chartData, paymentBreakdown, topProducts, lowStock}` from Task 2.
- Produces: `useDashboard(): { period: DashboardPeriod; setPeriod: (p: DashboardPeriod) => void; stats: DashboardStats | null; chartData: ChartBucket[]; paymentBreakdown: PaymentMethodBreakdown[]; topProducts: TopProduct[]; lowStockProducts: ProductRecord[]; loading: boolean; error: string | null }`; `<BarChart data={ChartBucket[]} ariaLabel={string} />` — Task 4's `DashboardPage` consumes both exact shapes.

- [ ] **Step 1: Write the failing hook tests**

Replace the full contents of `src/renderer/src/features/dashboard/useDashboard.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useDashboard } from './useDashboard'
import type {
  DashboardStats,
  ChartBucket,
  PaymentMethodBreakdown,
  TopProduct
} from '../../../../shared/dashboard'
import type { ProductRecord } from '../../../../shared/product'

const todayStats: DashboardStats = {
  current: { salesCents: 4000, orderCount: 2, unitsSold: 5, avgOrderValueCents: 2000 },
  previous: { salesCents: 2000, orderCount: 1, unitsSold: 2, avgOrderValueCents: 2000 }
}
const sevenDayStats: DashboardStats = {
  current: { salesCents: 9000, orderCount: 5, unitsSold: 12, avgOrderValueCents: 1800 },
  previous: { salesCents: 8000, orderCount: 4, unitsSold: 10, avgOrderValueCents: 2000 }
}
const hourlyChart: ChartBucket[] = [{ label: '9 AM', totalCents: 4000 }]
const sevenDayChart: ChartBucket[] = [{ label: 'Mon', totalCents: 9000 }]
const paymentBreakdown: PaymentMethodBreakdown[] = [
  { paymentMethod: 'CASH', totalCents: 4000, count: 2 }
]
const topProducts: TopProduct[] = [
  { productId: '1', productName: 'Coke', totalQuantity: 5, totalRevenueCents: 10000 }
]
const lowStock: ProductRecord[] = [
  {
    id: '1',
    barcode: '111',
    name: 'Coke',
    priceCents: 2000,
    stock: 1,
    isActive: true,
    categoryId: null,
    imagePath: null,
    createdAt: '',
    updatedAt: ''
  }
]

describe('useDashboard', () => {
  beforeEach(() => {
    window.api = {
      dbHealth: vi.fn(),
      products: { list: vi.fn(), create: vi.fn(), update: vi.fn(), getByBarcode: vi.fn() },
      sales: { complete: vi.fn() },
      dashboard: {
        stats: vi.fn().mockImplementation((period: string) =>
          Promise.resolve(period === 'today' ? todayStats : sevenDayStats)
        ),
        chartData: vi.fn().mockImplementation((period: string) =>
          Promise.resolve(period === 'today' ? hourlyChart : sevenDayChart)
        ),
        paymentBreakdown: vi.fn().mockResolvedValue(paymentBreakdown),
        topProducts: vi.fn().mockResolvedValue(topProducts),
        lowStock: vi.fn().mockResolvedValue(lowStock)
      },
      salesHistory: { list: vi.fn(), detail: vi.fn(), void: vi.fn(), exportCsv: vi.fn() }
    } as unknown as Window['api']
  })

  it("defaults to period 'today' and loads all five data sources", async () => {
    const { result } = renderHook(() => useDashboard())
    expect(result.current.loading).toBe(true)
    expect(result.current.period).toBe('today')

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.stats).toEqual(todayStats)
    expect(result.current.chartData).toEqual(hourlyChart)
    expect(result.current.paymentBreakdown).toEqual(paymentBreakdown)
    expect(result.current.topProducts).toEqual(topProducts)
    expect(result.current.lowStockProducts).toEqual(lowStock)
    expect(result.current.error).toBeNull()
    expect(window.api.dashboard.stats).toHaveBeenCalledWith('today')
    expect(window.api.dashboard.chartData).toHaveBeenCalledWith('today')
    expect(window.api.dashboard.paymentBreakdown).toHaveBeenCalledWith('today')
  })

  it('re-fetches stats, chart data, and payment breakdown when the period changes, without re-fetching top products or low stock', async () => {
    const { result } = renderHook(() => useDashboard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setPeriod('7days')
    })
    await waitFor(() => expect(result.current.stats).toEqual(sevenDayStats))

    expect(result.current.period).toBe('7days')
    expect(result.current.chartData).toEqual(sevenDayChart)
    expect(window.api.dashboard.stats).toHaveBeenCalledWith('7days')
    expect(window.api.dashboard.topProducts).toHaveBeenCalledTimes(1)
    expect(window.api.dashboard.lowStock).toHaveBeenCalledTimes(1)
  })

  it('surfaces a clean error message when a data source fails', async () => {
    ;(window.api.dashboard.stats as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Error invoking remote method 'dashboard:stats': Something broke")
    )
    const { result } = renderHook(() => useDashboard())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Something broke')
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run src/renderer/src/features/dashboard/useDashboard.test.ts`
Expected: FAIL — `useDashboard` still calls `window.api.dashboard.summary`/`sevenDaySales`, has no `period`/`setPeriod`.

- [ ] **Step 3: Rewrite the hook**

Replace the full contents of `src/renderer/src/features/dashboard/useDashboard.ts`:

```typescript
import { useEffect, useState } from 'react'
import type {
  DashboardPeriod,
  DashboardStats,
  ChartBucket,
  PaymentMethodBreakdown,
  TopProduct
} from '../../../../shared/dashboard'
import type { ProductRecord } from '../../../../shared/product'
import { toUserMessage } from '../../lib/ipcError'

export interface UseDashboardResult {
  period: DashboardPeriod
  setPeriod: (period: DashboardPeriod) => void
  stats: DashboardStats | null
  chartData: ChartBucket[]
  paymentBreakdown: PaymentMethodBreakdown[]
  topProducts: TopProduct[]
  lowStockProducts: ProductRecord[]
  loading: boolean
  error: string | null
}

export function useDashboard(): UseDashboardResult {
  const [period, setPeriod] = useState<DashboardPeriod>('today')
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [chartData, setChartData] = useState<ChartBucket[]>([])
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentMethodBreakdown[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [lowStockProducts, setLowStockProducts] = useState<ProductRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Top products and low stock are period-independent (unchanged from
  // Phase 5) — loaded once, not re-fetched when `period` changes.
  useEffect(() => {
    let ignore = false

    async function loadStatic(): Promise<void> {
      try {
        const [topProductsResult, lowStockResult] = await Promise.all([
          window.api.dashboard.topProducts(),
          window.api.dashboard.lowStock()
        ])
        if (!ignore) {
          setTopProducts(topProductsResult)
          setLowStockProducts(lowStockResult)
        }
      } catch (err) {
        if (!ignore) {
          setError(toUserMessage(err))
        }
      }
    }

    loadStatic()
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    let ignore = false

    async function loadPeriod(): Promise<void> {
      setLoading(true)
      try {
        const [statsResult, chartDataResult, paymentBreakdownResult] = await Promise.all([
          window.api.dashboard.stats(period),
          window.api.dashboard.chartData(period),
          window.api.dashboard.paymentBreakdown(period)
        ])
        if (!ignore) {
          setStats(statsResult)
          setChartData(chartDataResult)
          setPaymentBreakdown(paymentBreakdownResult)
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

    loadPeriod()
    return () => {
      ignore = true
    }
  }, [period])

  return {
    period,
    setPeriod,
    stats,
    chartData,
    paymentBreakdown,
    topProducts,
    lowStockProducts,
    loading,
    error
  }
}
```

- [ ] **Step 4: Run the hook tests to confirm they pass**

Run: `npx vitest run src/renderer/src/features/dashboard/useDashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing `BarChart` tests**

Replace the full contents of `src/renderer/src/features/dashboard/BarChart.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import BarChart from './BarChart'
import type { ChartBucket } from '../../../../shared/dashboard'

const sevenDays: ChartBucket[] = [
  { label: 'Fri', totalCents: 1000 },
  { label: 'Sat', totalCents: 0 },
  { label: 'Sun', totalCents: 3000 },
  { label: 'Mon', totalCents: 2000 },
  { label: 'Tue', totalCents: 0 },
  { label: 'Wed', totalCents: 5000 },
  { label: 'Thu', totalCents: 4000 }
]

describe('BarChart', () => {
  it('renders one bar per bucket', () => {
    const { container } = render(<BarChart data={sevenDays} ariaLabel="Sales for the last 7 days" />)
    expect(container.querySelectorAll('.bar-chart-bar')).toHaveLength(7)
  })

  it('scales the tallest bar taller than a shorter one', () => {
    const { container } = render(<BarChart data={sevenDays} ariaLabel="Sales for the last 7 days" />)
    const bars = container.querySelectorAll('.bar-chart-bar')
    const heights = Array.from(bars).map((bar) => Number(bar.getAttribute('height')))
    expect(heights[5]).toBeGreaterThan(heights[0])
    expect(heights[1]).toBe(0)
  })

  it('renders without error when every bucket is zero', () => {
    const empty: ChartBucket[] = sevenDays.map((bucket) => ({ ...bucket, totalCents: 0 }))
    const { container } = render(<BarChart data={empty} ariaLabel="Sales for the last 7 days" />)
    expect(container.querySelectorAll('.bar-chart-bar')).toHaveLength(7)
  })

  it('renders each bucket using exactly the label it was given, unmodified', () => {
    const { container } = render(<BarChart data={sevenDays} ariaLabel="Sales for the last 7 days" />)
    const labels = container.querySelectorAll('.bar-chart-label')
    expect(Array.from(labels).map((el) => el.textContent)).toEqual([
      'Fri',
      'Sat',
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu'
    ])
  })

  it('uses the given aria-label, so the same component can describe either an hourly or a daily chart', () => {
    const { container } = render(<BarChart data={sevenDays} ariaLabel="Sales by hour, today" />)
    expect(container.querySelector('svg')?.getAttribute('aria-label')).toBe('Sales by hour, today')
  })
})
```

- [ ] **Step 6: Run the `BarChart` tests to confirm they fail**

Run: `npx vitest run src/renderer/src/features/dashboard/BarChart.test.tsx`
Expected: FAIL — `BarChart` still expects `DailySales[]` (a `date` field, not `label`) and has no `ariaLabel` prop.

- [ ] **Step 7: Rewrite `BarChart`**

Replace the full contents of `src/renderer/src/features/dashboard/BarChart.tsx`:

```typescript
import { Money } from '../../../../shared/money'
import type { ChartBucket } from '../../../../shared/dashboard'

export interface BarChartProps {
  data: ChartBucket[]
  ariaLabel: string
}

const WIDTH = 560
const HEIGHT = 140
const BAR_GAP = 12

function BarChart({ data, ariaLabel }: BarChartProps): React.JSX.Element {
  const maxCents = Math.max(1, ...data.map((bucket) => bucket.totalCents))
  const count = Math.max(data.length, 1)
  const barWidth = (WIDTH - BAR_GAP * (count - 1)) / count

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT + 24}`} aria-label={ariaLabel} className="bar-chart">
      {data.map((bucket, index) => {
        const barHeight = (bucket.totalCents / maxCents) * HEIGHT
        const x = index * (barWidth + BAR_GAP)
        const y = HEIGHT - barHeight
        return (
          <g key={`${bucket.label}-${index}`}>
            <title>{`${bucket.label}: ${Money.fromCents(bucket.totalCents).format()}`}</title>
            <rect x={x} y={y} width={barWidth} height={barHeight} className="bar-chart-bar" />
            <text
              x={x + barWidth / 2}
              y={HEIGHT + 16}
              textAnchor="middle"
              className="bar-chart-label"
            >
              {bucket.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default BarChart
```

Note: the `key` is `${bucket.label}-${index}` rather than `bucket.label` alone, because two hourly buckets can share a label under some locale hour-cycle formats (e.g. a 12-hour locale renders both "12 AM" for midnight and, depending on formatting, could coincide with another bucket in an edge case) — `index` keeps every key unique regardless of locale, matching this component's existing precedent of never assuming its data's display strings are unique.

- [ ] **Step 8: Run the `BarChart` tests to confirm they pass**

Run: `npx vitest run src/renderer/src/features/dashboard/BarChart.test.tsx`
Expected: PASS.

- [ ] **Step 9: Full suite, typecheck, lint**

Run: `npm test`, `npm run typecheck`, `npm run lint`. Expect only Task 4's not-yet-updated `DashboardPage.tsx`/`.test.tsx` (which still import the old `DailySales`/`DashboardSummary` types and pass `<BarChart data={...} />` without `ariaLabel`) to fail typecheck; everything else in the suite should be green, since Task 1-3's own files are now fully consistent with each other.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/features/dashboard/useDashboard.ts src/renderer/src/features/dashboard/useDashboard.test.ts src/renderer/src/features/dashboard/BarChart.tsx src/renderer/src/features/dashboard/BarChart.test.tsx
git commit -m "feat: add period state to useDashboard and generalize BarChart to ChartBucket[]"
```

---

### Task 4: `DonutChart`, the `DashboardPage` rewrite, and styling

**Files:**
- Create: `src/renderer/src/features/dashboard/DonutChart.tsx`
- Test: `src/renderer/src/features/dashboard/DonutChart.test.tsx`
- Modify: `src/renderer/src/features/dashboard/DashboardPage.tsx`
- Test: `src/renderer/src/features/dashboard/DashboardPage.test.tsx`
- Modify: `src/renderer/src/assets/base.css`
- Modify: `src/renderer/src/assets/main.css`

**Interfaces:**
- Consumes: `useDashboard()` from Task 3; `<BarChart data ariaLabel />` from Task 3; `PAYMENT_METHODS`/`PaymentMethod` from `src/shared/sale.ts`; `PaymentMethodBreakdown` from Task 1's `shared/dashboard.ts`.
- Produces: `<DonutChart data={PaymentMethodBreakdown[]} />` — a self-contained leaf component, nothing later depends on it beyond this task's own `DashboardPage`.

- [ ] **Step 1: Add the chart color tokens**

In `src/renderer/src/assets/base.css`, add after the existing `--color-danger-hover` token:

```css
  --color-chart-1: #2b5f52;
  --color-chart-2: #c98a3e;
  --color-chart-3: #4a6fa5;
```

- [ ] **Step 2: Write the failing `DonutChart` tests**

Create `src/renderer/src/features/dashboard/DonutChart.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DonutChart from './DonutChart'
import type { PaymentMethodBreakdown } from '../../../../shared/dashboard'

const breakdown: PaymentMethodBreakdown[] = [
  { paymentMethod: 'CASH', totalCents: 6000, count: 3 },
  { paymentMethod: 'QR', totalCents: 3000, count: 2 },
  { paymentMethod: 'CARD', totalCents: 1000, count: 1 }
]

describe('DonutChart', () => {
  it('renders one ring segment per payment method with sales', () => {
    const { container } = render(<DonutChart data={breakdown} />)
    expect(container.querySelectorAll('.donut-chart-segment')).toHaveLength(3)
  })

  it('renders a legend row per payment method, with its amount and percentage of the total', () => {
    render(<DonutChart data={breakdown} />)
    // Total is 10000 -> CASH is 60%, QR is 30%, CARD is 10%
    expect(screen.getByText('CASH')).toBeInTheDocument()
    expect(screen.getByText('฿60.00 (60%)')).toBeInTheDocument()
    expect(screen.getByText('QR')).toBeInTheDocument()
    expect(screen.getByText('฿30.00 (30%)')).toBeInTheDocument()
    expect(screen.getByText('CARD')).toBeInTheDocument()
    expect(screen.getByText('฿10.00 (10%)')).toBeInTheDocument()
  })

  it('shows an empty hint instead of a chart when there are no sales in the period', () => {
    const { container } = render(<DonutChart data={[]} />)
    expect(container.querySelectorAll('.donut-chart-segment')).toHaveLength(0)
    expect(screen.getByText('No sales yet')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `npx vitest run src/renderer/src/features/dashboard/DonutChart.test.tsx`
Expected: FAIL — `./DonutChart` does not exist yet.

- [ ] **Step 4: Create `DonutChart`**

Create `src/renderer/src/features/dashboard/DonutChart.tsx`:

```typescript
import { Money } from '../../../../shared/money'
import type { PaymentMethodBreakdown } from '../../../../shared/dashboard'
import type { PaymentMethod } from '../../../../shared/sale'

export interface DonutChartProps {
  data: PaymentMethodBreakdown[]
}

const SIZE = 160
const STROKE = 28
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const SEGMENT_CLASS: Record<PaymentMethod, string> = {
  CASH: 'donut-segment-cash',
  QR: 'donut-segment-qr',
  CARD: 'donut-segment-card'
}

function DonutChart({ data }: DonutChartProps): React.JSX.Element {
  const totalCents = data.reduce((sum, entry) => sum + entry.totalCents, 0)

  if (totalCents === 0) {
    return <p className="empty-hint">No sales yet</p>
  }

  let cursor = 0
  const segments = data.map((entry) => {
    const fraction = entry.totalCents / totalCents
    const dash = fraction * CIRCUMFERENCE
    const offset = cursor
    cursor += dash
    return { ...entry, dash, offset, percent: Math.round(fraction * 100) }
  })

  return (
    <div className="donut-chart-wrap">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-label="Sales by payment method" className="donut-chart">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="donut-chart-track"
        />
        {segments.map((segment) => (
          <circle
            key={segment.paymentMethod}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            className={`donut-chart-segment ${SEGMENT_CLASS[segment.paymentMethod]}`}
            strokeDasharray={`${segment.dash} ${CIRCUMFERENCE - segment.dash}`}
            strokeDashoffset={-segment.offset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          >
            <title>{`${segment.paymentMethod}: ${Money.fromCents(segment.totalCents).format()}`}</title>
          </circle>
        ))}
      </svg>
      <ul className="donut-chart-legend">
        {segments.map((segment) => (
          <li key={segment.paymentMethod}>
            <span
              className={`donut-legend-swatch ${SEGMENT_CLASS[segment.paymentMethod]}`}
              aria-hidden="true"
            />
            <span>{segment.paymentMethod}</span>
            <span>
              {Money.fromCents(segment.totalCents).format()} ({segment.percent}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default DonutChart
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `npx vitest run src/renderer/src/features/dashboard/DonutChart.test.tsx`
Expected: PASS.

- [ ] **Step 6: Write the failing `DashboardPage` tests**

Replace the full contents of `src/renderer/src/features/dashboard/DashboardPage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DashboardPage from './DashboardPage'
import type {
  DashboardStats,
  ChartBucket,
  PaymentMethodBreakdown,
  TopProduct
} from '../../../../shared/dashboard'
import type { ProductRecord } from '../../../../shared/product'

const todayStats: DashboardStats = {
  current: { salesCents: 4000, orderCount: 2, unitsSold: 5, avgOrderValueCents: 2000 },
  previous: { salesCents: 2000, orderCount: 1, unitsSold: 2, avgOrderValueCents: 2000 }
}
const sevenDayStats: DashboardStats = {
  current: { salesCents: 9000, orderCount: 5, unitsSold: 12, avgOrderValueCents: 1800 },
  previous: { salesCents: 8000, orderCount: 4, unitsSold: 10, avgOrderValueCents: 2000 }
}
const hourlyChart: ChartBucket[] = [{ label: '9 AM', totalCents: 4000 }]
const sevenDayChart: ChartBucket[] = [{ label: 'Mon', totalCents: 9000 }]
const paymentBreakdown: PaymentMethodBreakdown[] = [
  { paymentMethod: 'CASH', totalCents: 4000, count: 2 }
]
const topProducts: TopProduct[] = [
  { productId: '1', productName: 'Coke', totalQuantity: 5, totalRevenueCents: 10000 }
]
const lowStock: ProductRecord[] = [
  {
    id: '1',
    barcode: '111',
    name: 'Water',
    priceCents: 1000,
    stock: 1,
    isActive: true,
    categoryId: null,
    imagePath: null,
    createdAt: '',
    updatedAt: ''
  }
]

describe('DashboardPage', () => {
  beforeEach(() => {
    window.api = {
      dbHealth: vi.fn(),
      products: { list: vi.fn(), create: vi.fn(), update: vi.fn(), getByBarcode: vi.fn() },
      sales: { complete: vi.fn() },
      dashboard: {
        stats: vi.fn().mockImplementation((period: string) =>
          Promise.resolve(period === 'today' ? todayStats : sevenDayStats)
        ),
        chartData: vi.fn().mockImplementation((period: string) =>
          Promise.resolve(period === 'today' ? hourlyChart : sevenDayChart)
        ),
        paymentBreakdown: vi.fn().mockResolvedValue(paymentBreakdown),
        topProducts: vi.fn().mockResolvedValue(topProducts),
        lowStock: vi.fn().mockResolvedValue(lowStock)
      },
      salesHistory: { list: vi.fn(), detail: vi.fn(), void: vi.fn(), exportCsv: vi.fn() }
    } as unknown as Window['api']
  })

  it('renders all four stat cards, formatted as money where applicable, with a growth indicator', async () => {
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('Total Sales')).toBeInTheDocument())

    const salesCard = screen.getByText('Total Sales').closest('.stat-card') as HTMLElement
    expect(within(salesCard).getByText('฿40.00')).toBeInTheDocument()
    // current 4000 vs previous 2000 -> +100%
    expect(within(salesCard).getByText('+100% vs previous period')).toBeInTheDocument()

    const ordersCard = screen.getByText('Total Orders').closest('.stat-card') as HTMLElement
    expect(within(ordersCard).getByText('2')).toBeInTheDocument()

    const avgCard = screen.getByText('Avg Order Value').closest('.stat-card') as HTMLElement
    expect(within(avgCard).getByText('฿20.00')).toBeInTheDocument()

    const unitsCard = screen.getByText('Units Sold').closest('.stat-card') as HTMLElement
    expect(within(unitsCard).getByText('5')).toBeInTheDocument()
  })

  it("shows a neutral '—' growth indicator when the previous period has no data", async () => {
    ;(window.api.dashboard.stats as ReturnType<typeof vi.fn>).mockResolvedValue({
      current: { salesCents: 5000, orderCount: 1, unitsSold: 1, avgOrderValueCents: 5000 },
      previous: { salesCents: 0, orderCount: 0, unitsSold: 0, avgOrderValueCents: 0 }
    })
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('Total Sales')).toBeInTheDocument())
    const salesCard = screen.getByText('Total Sales').closest('.stat-card') as HTMLElement
    expect(within(salesCard).getByText('— vs previous period')).toBeInTheDocument()
  })

  it('defaults to the Today period and switching to 7 Days re-fetches stats, chart, and breakdown', async () => {
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('Total Sales')).toBeInTheDocument())
    expect(screen.getByLabelText('Period')).toHaveValue('today')
    expect(screen.getByText('Today by Hour')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Period'), '7days')

    await waitFor(() => expect(screen.getByText('Last 7 Days')).toBeInTheDocument())
    const salesCard = screen.getByText('Total Sales').closest('.stat-card') as HTMLElement
    // current 9000 vs previous 8000 -> +13%
    await waitFor(() => expect(within(salesCard).getByText('฿90.00')).toBeInTheDocument())
    expect(within(salesCard).getByText('+13% vs previous period')).toBeInTheDocument()
  })

  it('renders the payment method donut chart', async () => {
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('Sales by Payment Method')).toBeInTheDocument())
    expect(screen.getByText('฿40.00 (100%)')).toBeInTheDocument()
  })

  it('renders the top products list', async () => {
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('1. Coke')).toBeInTheDocument())
    expect(screen.getByText('5 sold · ฿100.00')).toBeInTheDocument()
  })

  it('renders the low stock list', async () => {
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('Water')).toBeInTheDocument())
    expect(screen.getByText('1 left')).toBeInTheDocument()
  })

  it('shows an empty hint when there are no top products yet', async () => {
    ;(window.api.dashboard.topProducts as ReturnType<typeof vi.fn>).mockResolvedValue([])
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getAllByText('No sales yet').length).toBeGreaterThan(0))
  })

  it('shows an error message when loading fails', async () => {
    ;(window.api.dashboard.stats as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'))
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('boom'))
  })
})
```

- [ ] **Step 7: Run the tests to confirm they fail**

Run: `npx vitest run src/renderer/src/features/dashboard/DashboardPage.test.tsx`
Expected: FAIL — the current page has 3 stat cards with old labels, no period selector, no donut chart panel.

- [ ] **Step 8: Rewrite `DashboardPage`**

Replace the full contents of `src/renderer/src/features/dashboard/DashboardPage.tsx`:

```typescript
import { useDashboard } from './useDashboard'
import BarChart from './BarChart'
import DonutChart from './DonutChart'
import { Money } from '../../../../shared/money'
import type { DashboardPeriod } from '../../../../shared/dashboard'

interface StatCardProps {
  label: string
  value: string
  current: number
  previous: number
}

function formatGrowth(current: number, previous: number): { text: string; className: string } {
  if (previous === 0) {
    return { text: '—', className: 'stat-growth-neutral' }
  }
  const percent = Math.round(((current - previous) / previous) * 100)
  if (percent > 0) {
    return { text: `+${percent}%`, className: 'stat-growth-positive' }
  }
  if (percent < 0) {
    return { text: `${percent}%`, className: 'stat-growth-negative' }
  }
  return { text: '0%', className: 'stat-growth-neutral' }
}

function StatCard({ label, value, current, previous }: StatCardProps): React.JSX.Element {
  const growth = formatGrowth(current, previous)
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <span className={`stat-growth ${growth.className}`}>{growth.text} vs previous period</span>
    </div>
  )
}

function DashboardPage(): React.JSX.Element {
  const {
    period,
    setPeriod,
    stats,
    chartData,
    paymentBreakdown,
    topProducts,
    lowStockProducts,
    loading,
    error
  } = useDashboard()

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
        <div className="products-header">
          <h1>Dashboard</h1>
        </div>
        <p role="alert" className="alert alert-danger alert-inline">
          {error}
        </p>
      </div>
    )
  }

  const current = stats?.current ?? { salesCents: 0, orderCount: 0, unitsSold: 0, avgOrderValueCents: 0 }
  const previous = stats?.previous ?? { salesCents: 0, orderCount: 0, unitsSold: 0, avgOrderValueCents: 0 }

  return (
    <div className="products-page">
      <div className="products-header">
        <h1>Dashboard</h1>
        <div className="field">
          <label htmlFor="dashboard-period">Period</label>
          <select
            id="dashboard-period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as DashboardPeriod)}
          >
            <option value="today">Today</option>
            <option value="7days">Last 7 Days</option>
          </select>
        </div>
      </div>

      <div className="dashboard-stats">
        <StatCard
          label="Total Sales"
          value={Money.fromCents(current.salesCents).format()}
          current={current.salesCents}
          previous={previous.salesCents}
        />
        <StatCard
          label="Total Orders"
          value={String(current.orderCount)}
          current={current.orderCount}
          previous={previous.orderCount}
        />
        <StatCard
          label="Avg Order Value"
          value={Money.fromCents(current.avgOrderValueCents).format()}
          current={current.avgOrderValueCents}
          previous={previous.avgOrderValueCents}
        />
        <StatCard
          label="Units Sold"
          value={String(current.unitsSold)}
          current={current.unitsSold}
          previous={previous.unitsSold}
        />
      </div>

      <div className="dashboard-panels">
        <div className="dashboard-panel dashboard-panel-chart">
          <h2>{period === 'today' ? 'Today by Hour' : 'Last 7 Days'}</h2>
          <BarChart
            data={chartData}
            ariaLabel={period === 'today' ? 'Sales by hour, today' : 'Sales for the last 7 days'}
          />
        </div>

        <div className="dashboard-panel dashboard-panel-donut">
          <h2>Sales by Payment Method</h2>
          <DonutChart data={paymentBreakdown} />
        </div>

        <div className="dashboard-panel dashboard-panel-top">
          <h2>Top Products</h2>
          {topProducts.length === 0 ? (
            <p className="empty-hint">No sales yet</p>
          ) : (
            <ol className="top-products-list">
              {topProducts.map((product, index) => (
                <li key={product.productId}>
                  <span>
                    {index + 1}. {product.productName}
                  </span>
                  <span>
                    {product.totalQuantity} sold ·{' '}
                    {Money.fromCents(product.totalRevenueCents).format()}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="dashboard-panel dashboard-panel-low">
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

- [ ] **Step 9: Run the tests to confirm they pass**

Run: `npx vitest run src/renderer/src/features/dashboard/DashboardPage.test.tsx`
Expected: PASS.

- [ ] **Step 10: Update the dashboard CSS**

In `src/renderer/src/assets/main.css`, replace the `.dashboard-stats` rule:

```css
.dashboard-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
}
```

Add, immediately after `.stat-value`:

```css
.stat-growth {
  font-size: 12px;
  font-weight: 600;
}

.stat-growth-positive {
  color: var(--color-success);
}

.stat-growth-negative {
  color: var(--color-danger);
}

.stat-growth-neutral {
  color: var(--color-ink-faint);
}
```

Replace the `.dashboard-panels` rule and add the four area classes right after it:

```css
.dashboard-panels {
  display: grid;
  grid-template-columns: 2fr 1fr;
  grid-template-areas:
    'chart donut'
    'top low';
  gap: var(--space-4);
  flex: 1;
  min-height: 0;
}

.dashboard-panel-chart {
  grid-area: chart;
}

.dashboard-panel-donut {
  grid-area: donut;
}

.dashboard-panel-top {
  grid-area: top;
}

.dashboard-panel-low {
  grid-area: low;
}
```

Add, after the existing `.bar-chart-label` rule:

```css
.donut-chart-wrap {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.donut-chart {
  width: 140px;
  height: 140px;
  flex-shrink: 0;
}

.donut-chart-track {
  stroke: var(--color-surface-sunken);
}

.donut-segment-cash {
  --donut-color: var(--color-chart-1);
}

.donut-segment-qr {
  --donut-color: var(--color-chart-2);
}

.donut-segment-card {
  --donut-color: var(--color-chart-3);
}

.donut-chart-segment {
  stroke: var(--donut-color);
}

.donut-chart-legend {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: 13px;
  padding-inline-start: 0;
  list-style: none;
}

.donut-chart-legend li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.donut-legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  background: var(--donut-color);
}
```

Finally, update the existing narrow-viewport media query so both new grids collapse to a single column the same way the old ones did:

```css
@media (max-width: 900px) {
  .dashboard-stats {
    grid-template-columns: 1fr;
  }
  .dashboard-panels {
    grid-template-columns: 1fr;
    grid-template-areas:
      'chart'
      'donut'
      'top'
      'low';
  }
}
```

- [ ] **Step 11: Visually sanity-check in the running app**

Run the app (`npm run dev` or whatever this project's existing dev script is — check `package.json`), open the Dashboard page, and confirm: four stat cards render with a growth line each; the period dropdown toggles between an hourly bar chart and a 7-day bar chart; the payment-method donut chart renders with a legend; Top Products/Low Stock look unchanged from before this phase. Fix anything that looks visually broken before moving on (this step has no fixed pass/fail assertion — use judgment).

- [ ] **Step 12: Full suite, typecheck, lint**

Run: `npm test`, `npm run typecheck`, `npm run lint`. All three must be fully clean — this is the last task in the plan.

- [ ] **Step 13: Commit**

```bash
git add src/renderer/src/features/dashboard/DonutChart.tsx src/renderer/src/features/dashboard/DonutChart.test.tsx src/renderer/src/features/dashboard/DashboardPage.tsx src/renderer/src/features/dashboard/DashboardPage.test.tsx src/renderer/src/assets/base.css src/renderer/src/assets/main.css
git commit -m "feat: add payment-method donut chart and rewrite Dashboard with period toggle and growth indicators"
```
