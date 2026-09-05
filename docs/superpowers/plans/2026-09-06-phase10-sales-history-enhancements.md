# Phase 10: Sales History Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Payment Method column/filter, a Status column/filter, a real Void action (with a required reason and an explicit confirm step, atomic and irreversible), a date-range filter, and a CSV export to the Sales History screen, per `docs/superpowers/specs/2026-09-05-pos-enhancements-design.md`.

**Architecture:** One new table (`sale_voids`, an audit ledger matching the existing `stock_transactions` "the fact of a state change gets its own row" convention) and one new repository function (`voidSale`) that mirrors `completeSale`'s exact atomicity pattern — one `db.transaction()`, stock/`stock_transactions` writes for every line, then the status change, all rolled back together on any failure. `sales.status` already supports an arbitrary second value with no schema change (it's a plain `text` column defaulting to `'COMPLETED'`); this phase is what finally writes `'VOID'` into it. Every filter (payment method, status, date range) is client-side, matching the established `ProductsPage` category-filter precedent — `listSales()` keeps returning everything, unfiltered, and `SalesHistoryPage.tsx` narrows it in memory. CSV export reuses that same filtered, in-memory list: the renderer sends it to a new IPC handler, which re-fetches each sale's full line items (for a human-readable "Items" column) and writes the file via `dialog.showSaveDialog` + a small hand-rolled CSV writer — the columns here are fixed and few, not worth a dependency.

**Tech Stack:** Same as the rest of the app — Electron main process, Drizzle ORM/better-sqlite3, React 19 renderer, Vitest + React Testing Library. No new dependencies.

## Global Constraints

- Every write path gets a test in the same task; assert real outcomes against a real SQLite DB or real rendered DOM — no "it didn't throw" tests.
- The renderer never imports `better-sqlite3`/`drizzle-orm`/`electron`'s main-process APIs, or anything under `src/main/**` — everything crosses `window.api`.
- Money is always an integer number of satang through the `Money` class — never raw `+`/`-`/`*` on a `cents` number.
- Domain errors are named classes extending `Error` with a `.name` override (matching `SaleValidationError`, `EmptyCartError`, `ProductNotFoundError`, etc.) — never a bare `throw new Error(...)` for an expected validation/business-rule failure.
- Voiding is one atomic `db.transaction()`: update `sales.status` to `'VOID'`, insert one `sale_voids` row, and insert one `stock_transactions` row per original sale line with `type: 'VOID'` and a **positive** quantity (returning stock) — mirroring `completeSale`'s existing sign convention (negative = deduction, positive = return) so `SUM(quantity)` across a product's transactions still reconstructs its stock from zero. `products.stock` is incremented by each line's quantity in the same transaction.
- A sale can only be voided once — voiding an already-`VOID` sale is rejected (`SaleAlreadyVoidError`), and nothing about a void is reversible — there is no un-void.
- Voiding requires a non-empty reason (validated before any write) and the UI requires an explicit, separate confirmation step beyond just typing the reason — a single "type and submit" form is not sufficient.
- CSV fields are only quoted when they actually need it (contain a comma, a double-quote, or a line break) — doubling any internal `"` — matching standard CSV escaping, not an always-quote-everything shortcut.

## File Structure

- Modify: `src/main/database/schema.ts` — new `saleVoids` table.
- Create (generated): a new `drizzle/*.sql` migration.
- Modify: `src/shared/sale.ts` — `SaleRecord` gains optional `voidReason`/`voidedAt`.
- Modify: `src/shared/salesHistory.ts` — `SaleListItem` gains `status`/`paymentMethod`.
- Modify: `src/main/database/repositories/sales-history-repository.ts` (+ test) — `listSales`/`getSaleWithItems` read the new fields; new `voidSale` (+ test) — the atomicity-critical function.
- Create: `src/main/csv.ts` (+ test) — the generic, directly-testable CSV escaping/writer.
- Modify: `src/main/ipc/register-sales-history-handlers.ts` (+ test) — `salesHistory:void`, `salesHistory:exportCsv`.
- Modify: `src/preload/index.ts`, `src/preload/index.d.ts` — the two new channels.
- Modify: `src/renderer/src/features/sales-history/useSalesHistory.ts` (its test's fixtures need the new fields) — no behavioral change, listed for the fixture ripple.
- Create: `src/renderer/src/features/sales-history/VoidSaleModal.tsx` (+ test) — the reason-then-confirm two-step flow.
- Modify: `src/renderer/src/features/sales-history/SalesHistoryPage.tsx` (+ test) — Payment Method/Status columns, the three filters, the Export button, the Void action.
- Modify: `src/renderer/src/features/sales-history/SaleDetailModal.tsx` (+ test) — shows the void reason/timestamp when applicable.
- Modify: `src/renderer/src/assets/base.css` — `--color-danger-hover` token.
- Modify: `src/renderer/src/assets/main.css` — `.btn-danger`, `.badge-completed`/`.badge-void`, toolbar/filter styles.

---

### Task 1: Schema, migration, and shared/read-path types

**Files:**
- Modify: `src/main/database/schema.ts`
- Create (generated): a new `drizzle/*.sql` migration
- Modify: `src/shared/sale.ts`
- Modify: `src/shared/salesHistory.ts`
- Modify: `src/main/database/repositories/sales-history-repository.ts`
- Test: `src/main/database/repositories/sales-history-repository.test.ts`
- Modify: `src/renderer/src/features/sales-history/SalesHistoryPage.test.tsx`, `src/renderer/src/features/sales-history/useSalesHistory.test.ts`, `src/renderer/src/features/sales-history/SaleDetailModal.test.tsx` — fixture-only updates (the extended `SaleListItem`/`SaleRecord` shapes make their existing hand-built fixtures incomplete)

**Interfaces:**
- Produces: `saleVoids` Drizzle table; `SaleRecord`'s `voidReason?: string`/`voidedAt?: string`; `SaleListItem`'s `status: string`/`paymentMethod: PaymentMethod`; `listSales(db): SaleListItem[]` and `getSaleWithItems(db, saleId): SaleRecord | undefined` both updated to populate the new fields — Task 2 (`voidSale`) and Task 3 (IPC/CSV) both read these exact shapes.

- [ ] **Step 1: Add the `sale_voids` table to `schema.ts`**

Add `saleVoids`, right after the existing `stockTransactions` table:

```typescript
export const saleVoids = sqliteTable('sale_voids', {
  id: text('id').primaryKey(),
  saleId: text('sale_id')
    .notNull()
    .references(() => sales.id),
  reason: text('reason').notNull(),
  voidedAt: text('voided_at').notNull()
})
```

- [ ] **Step 2: Generate and verify the migration**

Run: `npm run db:generate`
Expected: a new file appears under `drizzle/` (e.g. `0004_<generated-name>.sql`). Open it and confirm it contains exactly one `CREATE TABLE sale_voids (...)` statement with a foreign key to `sales(id)`, and touches no other table. If it contains anything else, stop and report rather than committing an unexpected migration.

- [ ] **Step 3: Extend `SaleRecord` and `SaleListItem`**

In `src/shared/sale.ts`, change:

```typescript
export interface SaleRecord {
  id: string
  totalCents: number
  status: string
  paymentMethod: PaymentMethod
  discountCents: number
  createdAt: string
  items: SaleItemRecord[]
}
```

to:

```typescript
export interface SaleRecord {
  id: string
  totalCents: number
  status: string
  paymentMethod: PaymentMethod
  discountCents: number
  createdAt: string
  items: SaleItemRecord[]
  voidReason?: string
  voidedAt?: string
}
```

In `src/shared/salesHistory.ts`, change:

```typescript
export interface SaleListItem {
  id: string
  billNumber: number
  totalCents: number
  createdAt: string
  itemCount: number
}
```

to:

```typescript
import type { PaymentMethod } from './sale'

export interface SaleListItem {
  id: string
  billNumber: number
  totalCents: number
  createdAt: string
  itemCount: number
  status: string
  paymentMethod: PaymentMethod
}
```

- [ ] **Step 4: Write the failing tests for the updated read paths**

`src/main/database/repositories/sales-history-repository.test.ts` currently imports nothing from `drizzle-orm` or `../schema` at all — its two `describe` blocks (`describe('listSales', ...)` and `describe('getSaleWithItems', ...)`, each with its own `beforeEach`/`afterEach`/`dbFile`/`client`) only import `createDbClient`, `createProduct`, `completeSale`, `listSales`, `getSaleWithItems`. Change the top of the file from:

```typescript
import { createDbClient, type DbClient } from '../client'
import { createProduct } from './product-repository'
import { completeSale } from './sale-repository'
import { listSales, getSaleWithItems } from './sales-history-repository'
```

to:

```typescript
import { eq } from 'drizzle-orm'
import { sales, saleVoids } from '../schema'
import { createDbClient, type DbClient } from '../client'
import { createProduct } from './product-repository'
import { completeSale } from './sale-repository'
import { listSales, getSaleWithItems } from './sales-history-repository'
```

Every existing `completeSale(client.db, [...])` call in this file already has a `'CASH'` third argument (from Phase 8) — leave those as they are.

Add this test inside the existing `describe('listSales', ...)` block, right after the `'reports the correct item count per sale'` test:

```typescript
  it("includes each sale's status and payment method", () => {
    const coke = createProduct(client.db, {
      barcode: '111',
      name: 'Coke',
      priceCents: 2000,
      stock: 50
    })
    completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 }
    ], 'QR')

    const [row] = listSales(client.db)
    expect(row.status).toBe('COMPLETED')
    expect(row.paymentMethod).toBe('QR')
  })
```

Add these two tests inside the existing `describe('getSaleWithItems', ...)` block, right after the `'returns undefined for a sale id that does not exist'` test:

```typescript
  it('omits voidReason/voidedAt for a sale that was never voided', () => {
    const coke = createProduct(client.db, {
      barcode: '111',
      name: 'Coke',
      priceCents: 2000,
      stock: 50
    })
    const sale = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 }
    ], 'CASH')

    const detail = getSaleWithItems(client.db, sale.id)
    expect(detail?.voidReason).toBeUndefined()
    expect(detail?.voidedAt).toBeUndefined()
  })

  it('includes voidReason/voidedAt once a sale_voids row exists for it', () => {
    const coke = createProduct(client.db, {
      barcode: '111',
      name: 'Coke',
      priceCents: 2000,
      stock: 50
    })
    const sale = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 }
    ], 'CASH')
    client.db
      .insert(saleVoids)
      .values({ id: 'void-1', saleId: sale.id, reason: 'Customer changed their mind', voidedAt: '2026-09-06T10:00:00.000Z' })
      .run()
    client.db.update(sales).set({ status: 'VOID' }).where(eq(sales.id, sale.id)).run()

    const detail = getSaleWithItems(client.db, sale.id)
    expect(detail?.status).toBe('VOID')
    expect(detail?.voidReason).toBe('Customer changed their mind')
    expect(detail?.voidedAt).toBe('2026-09-06T10:00:00.000Z')
  })
```

(The second test manipulates `sale_voids`/`sales` directly, bypassing `voidSale` — that function doesn't exist until Task 2. This test is only proving `getSaleWithItems`'s *read* side: given a `sale_voids` row exists, it's surfaced correctly. This `describe` block's own `client`/`dbFile` are freshly created per-test by its existing `beforeEach`, so this direct manipulation is isolated from every other test in the file.)

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run src/main/database/repositories/sales-history-repository.test.ts`
Expected: FAIL — `listSales`'s rows don't have `status`/`paymentMethod` yet, and `getSaleWithItems` never queries `sale_voids`.

- [ ] **Step 6: Update `listSales` and `getSaleWithItems`**

Change `src/main/database/repositories/sales-history-repository.ts` from:

```typescript
import { eq, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { sales, saleItems } from '../schema'
import type { SaleListItem } from '../../../shared/salesHistory'
import type { SaleRecord, PaymentMethod } from '../../../shared/sale'

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
    paymentMethod: sale.paymentMethod as PaymentMethod,
    discountCents: sale.discountCents,
    createdAt: sale.createdAt,
    items
  }
}
```

to:

```typescript
import { eq, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { sales, saleItems, saleVoids } from '../schema'
import type { SaleListItem } from '../../../shared/salesHistory'
import type { SaleRecord, PaymentMethod } from '../../../shared/sale'

export function listSales(db: BetterSQLite3Database): SaleListItem[] {
  const rows = db
    .select({
      id: sales.id,
      totalCents: sales.totalCents,
      createdAt: sales.createdAt,
      status: sales.status,
      paymentMethod: sales.paymentMethod,
      itemCount: sql<number>`COUNT(${saleItems.id})`
    })
    .from(sales)
    .leftJoin(saleItems, eq(saleItems.saleId, sales.id))
    .groupBy(sales.id)
    .orderBy(sales.createdAt)
    .all()

  // Number oldest-to-newest (stable, creation-order bill numbers), then
  // reverse so the returned list itself is newest-first for display.
  return rows
    .map((row, index) => ({ ...row, paymentMethod: row.paymentMethod as PaymentMethod, billNumber: index + 1 }))
    .reverse()
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
  // A sale can only ever be voided once, so at most one row exists here.
  const voidRecord = db.select().from(saleVoids).where(eq(saleVoids.saleId, saleId)).get()
  return {
    id: sale.id,
    totalCents: sale.totalCents,
    status: sale.status,
    paymentMethod: sale.paymentMethod as PaymentMethod,
    discountCents: sale.discountCents,
    createdAt: sale.createdAt,
    items,
    ...(voidRecord ? { voidReason: voidRecord.reason, voidedAt: voidRecord.voidedAt } : {})
  }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/main/database/repositories/sales-history-repository.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 8: Fix the renderer fixture ripple**

Extending `SaleListItem` and `SaleRecord` makes three existing hand-built fixtures incomplete (TypeScript will fail to compile them without the new required fields). All three are mechanical, no logic changes:

In `src/renderer/src/features/sales-history/SalesHistoryPage.test.tsx`, change the `list` fixture from:
```typescript
const list: SaleListItem[] = [
  {
    id: 'sale-1',
    billNumber: 1,
    totalCents: 4000,
    createdAt: '2026-09-03T10:00:00.000Z',
    itemCount: 2
  }
]
```
to:
```typescript
const list: SaleListItem[] = [
  {
    id: 'sale-1',
    billNumber: 1,
    totalCents: 4000,
    createdAt: '2026-09-03T10:00:00.000Z',
    itemCount: 2,
    status: 'COMPLETED',
    paymentMethod: 'CASH'
  }
]
```
(The `detail: SaleRecord` fixture in this same file already has `status`/`paymentMethod` from Phase 8 — it needs no change; `voidReason`/`voidedAt` are optional, so omitting them is already valid.)

In `src/renderer/src/features/sales-history/useSalesHistory.test.ts`, change both `SaleListItem` object literals — the `list` fixture and the `updated` array's second entry inside the `'reload() re-fetches the list'` test — to add `status: 'COMPLETED', paymentMethod: 'CASH'` to each one, the same way as above.

Check `src/renderer/src/features/sales-history/SaleDetailModal.test.tsx`'s `sale: SaleRecord` fixture — if it already has `status`/`paymentMethod` (it should, from Phase 8), no change is needed there; `voidReason`/`voidedAt` being absent is valid since they're optional.

- [ ] **Step 9: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS. If anything else fails, stop and investigate before proceeding — Task 2/3/4 build on this being fully green.

- [ ] **Step 10: Commit**

```bash
git add src/main/database/schema.ts drizzle/ src/shared/sale.ts src/shared/salesHistory.ts src/main/database/repositories/sales-history-repository.ts src/main/database/repositories/sales-history-repository.test.ts src/renderer/src/features/sales-history/SalesHistoryPage.test.tsx src/renderer/src/features/sales-history/useSalesHistory.test.ts
git commit -m "feat: add sale_voids table and payment method/status/void fields to sales history reads"
```

---

### Task 2: `voidSale()` — the atomicity-critical repository function

**Files:**
- Modify: `src/main/database/repositories/sales-history-repository.ts`
- Test: `src/main/database/repositories/sales-history-repository.test.ts`

**Interfaces:**
- Consumes: `saleVoids`/`sales`/`saleItems`/`stockTransactions`/`products` tables (Task 1's schema); `ProductNotFoundError` from `./product-repository`.
- Produces: `voidSale(db, saleId: string, reason: string): SaleRecord`; `class SaleNotFoundError`, `class SaleAlreadyVoidError` — Task 3 (IPC) imports this exact signature and both error classes.

- [ ] **Step 1: Write the failing tests**

By the end of Task 1, `src/main/database/repositories/sales-history-repository.test.ts`'s top imports are:

```typescript
import { eq } from 'drizzle-orm'
import { sales, saleVoids } from '../schema'
import { createDbClient, type DbClient } from '../client'
import { createProduct } from './product-repository'
import { completeSale } from './sale-repository'
import { listSales, getSaleWithItems } from './sales-history-repository'
```

Change that block to:

```typescript
import { eq } from 'drizzle-orm'
import { sales, saleVoids, products, stockTransactions } from '../schema'
import { createDbClient, type DbClient } from '../client'
import { createProduct, getProductById, ProductNotFoundError } from './product-repository'
import { completeSale, SaleValidationError } from './sale-repository'
import {
  listSales,
  getSaleWithItems,
  voidSale,
  SaleNotFoundError,
  SaleAlreadyVoidError
} from './sales-history-repository'
```

Add a new `describe('voidSale', ...)` block at the end of the file, after the existing `describe('getSaleWithItems', ...)` block closes — give it its own `beforeEach`/`afterEach`/`dbFile`/`client`, the exact same shape every other `describe` block in this file already uses:

```typescript
describe('voidSale', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-sales-history-repo-void-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('voids a completed sale: sets status, records the reason, and returns stock', () => {
    const water = createProduct(client.db, {
      barcode: '222',
      name: 'Water',
      priceCents: 1000,
      stock: 10
    })
    const sale = completeSale(
      client.db,
      [{ productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 3 }],
      'CASH'
    )
    const stockAfterSale = getProductById(client.db, water.id)?.stock
    expect(stockAfterSale).toBe(7)

    const voided = voidSale(client.db, sale.id, 'Customer changed their mind')

    expect(voided.status).toBe('VOID')
    expect(voided.voidReason).toBe('Customer changed their mind')
    expect(voided.voidedAt).toBeDefined()

    const stockAfterVoid = getProductById(client.db, water.id)?.stock
    expect(stockAfterVoid).toBe(10)

    const voidRows = client.db.select().from(saleVoids).where(eq(saleVoids.saleId, sale.id)).all()
    expect(voidRows).toHaveLength(1)
    expect(voidRows[0].reason).toBe('Customer changed their mind')

    const returnTxns = client.db
      .select()
      .from(stockTransactions)
      .where(eq(stockTransactions.referenceId, sale.id))
      .all()
      .filter((txn) => txn.type === 'VOID')
    expect(returnTxns).toHaveLength(1)
    expect(returnTxns[0]).toMatchObject({ productId: water.id, quantity: 3, type: 'VOID' })
  })

  it('voids a multi-line sale, returning stock for every line', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 10 })
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 10 })
    const sale = completeSale(
      client.db,
      [
        { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 2 },
        { productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 4 }
      ],
      'CASH'
    )

    voidSale(client.db, sale.id, 'Wrong order')

    expect(getProductById(client.db, coke.id)?.stock).toBe(10)
    expect(getProductById(client.db, water.id)?.stock).toBe(10)
    const returnTxns = client.db
      .select()
      .from(stockTransactions)
      .where(eq(stockTransactions.referenceId, sale.id))
      .all()
      .filter((txn) => txn.type === 'VOID')
    expect(returnTxns).toHaveLength(2)
  })

  it('rejects voiding with an empty reason, writing nothing', () => {
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 5 })
    const sale = completeSale(
      client.db,
      [{ productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 1 }],
      'CASH'
    )

    expect(() => voidSale(client.db, sale.id, '   ')).toThrow(SaleValidationError)

    const unchanged = getSaleWithItems(client.db, sale.id)
    expect(unchanged?.status).toBe('COMPLETED')
    expect(client.db.select().from(saleVoids).where(eq(saleVoids.saleId, sale.id)).all()).toHaveLength(0)
  })

  it('throws SaleNotFoundError for a sale id that does not exist', () => {
    expect(() => voidSale(client.db, 'does-not-exist', 'Some reason')).toThrow(SaleNotFoundError)
  })

  it('rejects voiding an already-void sale, and does not double-return stock', () => {
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 10 })
    const sale = completeSale(
      client.db,
      [{ productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 3 }],
      'CASH'
    )
    voidSale(client.db, sale.id, 'First void')

    expect(() => voidSale(client.db, sale.id, 'Trying again')).toThrow(SaleAlreadyVoidError)

    expect(getProductById(client.db, water.id)?.stock).toBe(10)
    expect(client.db.select().from(saleVoids).where(eq(saleVoids.saleId, sale.id)).all()).toHaveLength(1)
  })

  it('rolls back the entire void when a line references a product that no longer exists, leaving earlier lines\' stock untouched', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 10 })
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 10 })
    const sale = completeSale(
      client.db,
      [
        { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 2 },
        { productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 4 }
      ],
      'CASH'
    )
    // Simulate a corrupted/inconsistent database (products are never
    // hard-deleted by any normal app code path) to force a genuine
    // mid-transaction failure on the second line, after the first
    // line's stock update has already run inside the same transaction —
    // proving the whole thing rolls back together, not just the failing
    // line.
    client.db.delete(products).where(eq(products.id, water.id)).run()

    expect(() => voidSale(client.db, sale.id, 'Testing rollback')).toThrow(ProductNotFoundError)

    expect(getProductById(client.db, coke.id)?.stock).toBe(8)
    const unchanged = getSaleWithItems(client.db, sale.id)
    expect(unchanged?.status).toBe('COMPLETED')
    expect(client.db.select().from(saleVoids).where(eq(saleVoids.saleId, sale.id)).all()).toHaveLength(0)
    expect(
      client.db
        .select()
        .from(stockTransactions)
        .where(eq(stockTransactions.referenceId, sale.id))
        .all()
        .filter((txn) => txn.type === 'VOID')
    ).toHaveLength(0)
  })
})
```

(The last test's `client.db.delete(products)...` line is the one place in this whole codebase that hard-deletes a product — deliberately, only inside this one test, to construct a scenario `voidSale` must defend against. Nothing in application code ever does this.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/main/database/repositories/sales-history-repository.test.ts`
Expected: FAIL — `voidSale` doesn't exist yet.

- [ ] **Step 3: Implement `voidSale`**

Add to `src/main/database/repositories/sales-history-repository.ts`. First, update the imports at the top from:

```typescript
import { eq, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { sales, saleItems, saleVoids } from '../schema'
import type { SaleListItem } from '../../../shared/salesHistory'
import type { SaleRecord, PaymentMethod } from '../../../shared/sale'
```

to:

```typescript
import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { sales, saleItems, saleVoids, products, stockTransactions } from '../schema'
import type { SaleListItem } from '../../../shared/salesHistory'
import type { SaleRecord, PaymentMethod } from '../../../shared/sale'
import { SaleValidationError } from './sale-repository'
import { ProductNotFoundError } from './product-repository'
```

Then add these two error classes and the function, at the end of the file:

```typescript
export class SaleNotFoundError extends Error {
  constructor(id: string) {
    super(`No sale found with id "${id}"`)
    this.name = 'SaleNotFoundError'
  }
}

export class SaleAlreadyVoidError extends Error {
  constructor(id: string) {
    super(`Sale "${id}" has already been voided`)
    this.name = 'SaleAlreadyVoidError'
  }
}

export function voidSale(db: BetterSQLite3Database, saleId: string, reason: string): SaleRecord {
  if (!reason || reason.trim().length === 0) {
    throw new SaleValidationError('A reason is required to void a sale')
  }
  const trimmedReason = reason.trim()

  // Same atomicity mechanism completeSale relies on: this whole callback
  // runs inside one BEGIN/COMMIT, and throwing anywhere in it — including
  // partway through returning stock for a multi-line sale — rolls
  // everything in this callback back together.
  return db.transaction((tx) => {
    const sale = tx.select().from(sales).where(eq(sales.id, saleId)).get()
    if (!sale) {
      throw new SaleNotFoundError(saleId)
    }
    if (sale.status === 'VOID') {
      throw new SaleAlreadyVoidError(saleId)
    }

    const now = new Date().toISOString()
    const items = tx.select().from(saleItems).where(eq(saleItems.saleId, saleId)).all()

    items.forEach((item) => {
      const product = tx.select().from(products).where(eq(products.id, item.productId)).get()
      if (!product) {
        throw new ProductNotFoundError(item.productId)
      }

      tx.update(products)
        .set({ stock: product.stock + item.quantity, updatedAt: now })
        .where(eq(products.id, item.productId))
        .run()

      // Positive quantity: this row records a return, the mirror image of
      // completeSale's negative SALE rows — the sign is what keeps
      // SUM(quantity) meaningful as a running stock reconstruction.
      tx.insert(stockTransactions)
        .values({
          id: randomUUID(),
          productId: item.productId,
          type: 'VOID',
          quantity: item.quantity,
          referenceId: saleId,
          createdAt: now
        })
        .run()
    })

    tx.update(sales).set({ status: 'VOID' }).where(eq(sales.id, saleId)).run()

    tx.insert(saleVoids)
      .values({ id: randomUUID(), saleId, reason: trimmedReason, voidedAt: now })
      .run()

    return {
      id: sale.id,
      totalCents: sale.totalCents,
      status: 'VOID',
      paymentMethod: sale.paymentMethod as PaymentMethod,
      discountCents: sale.discountCents,
      createdAt: sale.createdAt,
      items: items as SaleRecord['items'],
      voidReason: trimmedReason,
      voidedAt: now
    }
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/main/database/repositories/sales-history-repository.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/database/repositories/sales-history-repository.ts src/main/database/repositories/sales-history-repository.test.ts
git commit -m "feat: add voidSale with atomic stock return and a one-time-only guard"
```

---

### Task 3: IPC handlers, CSV writer, and preload

**Files:**
- Create: `src/main/csv.ts`
- Test: `src/main/csv.test.ts`
- Modify: `src/main/ipc/register-sales-history-handlers.ts`
- Test: `src/main/ipc/register-sales-history-handlers.test.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

**Interfaces:**
- Consumes: `voidSale(db, saleId, reason)` (Task 2); `getSaleWithItems(db, saleId)` (Task 1, used to build the CSV "Items" column); `Money` from `../../shared/money`.
- Produces: `toCsv(headers: string[], rows: string[][]): string`; IPC channels `salesHistory:void` and `salesHistory:exportCsv`; `window.api.salesHistory.void(saleId: string, reason: string): Promise<SaleRecord>` and `window.api.salesHistory.exportCsv(sales: SaleListItem[]): Promise<{ canceled: boolean }>` — Task 4 (frontend) calls both exactly as specified here.

- [ ] **Step 1: Write the failing test for the CSV writer**

```typescript
// src/main/csv.test.ts
import { describe, it, expect } from 'vitest'
import { toCsv } from './csv'

describe('toCsv', () => {
  it('joins headers and rows with commas and CRLF line endings', () => {
    const csv = toCsv(['A', 'B'], [['1', '2'], ['3', '4']])
    expect(csv).toBe('A,B\r\n1,2\r\n3,4')
  })

  it('leaves a plain field unquoted', () => {
    expect(toCsv(['H'], [['plain']])).toBe('H\r\nplain')
  })

  it('quotes a field containing a comma', () => {
    expect(toCsv(['H'], [['a,b']])).toBe('H\r\n"a,b"')
  })

  it('quotes a field containing a double-quote, doubling the internal quote', () => {
    expect(toCsv(['H'], [['say "hi"']])).toBe('H\r\n"say ""hi"""')
  })

  it('quotes a field containing a line break', () => {
    expect(toCsv(['H'], [['line1\nline2']])).toBe('H\r\n"line1\nline2"')
  })

  it('quotes a field containing both a comma and a quote together', () => {
    expect(toCsv(['H'], [['Chips, "BBQ" flavor']])).toBe('H\r\n"Chips, ""BBQ"" flavor"')
  })

  it('handles an empty rows array, producing just the header line', () => {
    expect(toCsv(['A', 'B'], [])).toBe('A,B')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/csv.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement `toCsv`**

```typescript
// src/main/csv.ts
function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCsvField).join(',')).join('\r\n')
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/main/csv.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for the IPC handlers**

Add to `src/main/ipc/register-sales-history-handlers.test.ts`. This file already imports the real `fs`/`path`/`os` modules (for its own temp-DB-file setup) and mocks `electron` with only `ipcMain`/`app` — change that `vi.mock('electron', ...)` block from:

```typescript
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener)
    }
  },
  app: { getPath: vi.fn() }
}))
```

to:

```typescript
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener)
    }
  },
  app: { getPath: vi.fn() },
  dialog: { showSaveDialog: vi.fn() }
}))
```

and add `import { dialog } from 'electron'` near the top (the mock above makes this the mocked object directly — no separate `vi.mock('node:fs', ...)` is needed or wanted: this file's existing `fs`/`path`/`os` imports are the REAL modules, and the export test below deliberately writes to and reads back a real temp file, matching this file's own established pattern for `dbFile` — do not mock `fs` for this task.)

Also add a new import line: `import { SaleAlreadyVoidError } from '../database/repositories/sales-history-repository'` (this is the same file `registerSalesHistoryHandlers` itself is already imported from a few lines above — `SaleAlreadyVoidError` is defined there, per Task 2, not in `sale-repository.ts`). Add a new import line for the type used by the first new test's cast: `import type { SaleRecord } from '../../shared/sale'`.

```typescript
  it('registers salesHistory:void and salesHistory:exportCsv', () => {
    expect(handlers.has('salesHistory:void')).toBe(true)
    expect(handlers.has('salesHistory:exportCsv')).toBe(true)
  })

  it('salesHistory:void voids a sale and returns stock', () => {
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 5 })
    const sale = completeSale(
      client.db,
      [{ productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 2 }],
      'CASH'
    )

    const voidHandler = handlers.get('salesHistory:void')!
    const voided = voidHandler({}, sale.id, 'Customer changed their mind') as SaleRecord

    expect(voided.status).toBe('VOID')
    expect(voided.voidReason).toBe('Customer changed their mind')
  })

  it('salesHistory:void propagates SaleAlreadyVoidError on a second void', () => {
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 5 })
    const sale = completeSale(
      client.db,
      [{ productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 1 }],
      'CASH'
    )
    const voidHandler = handlers.get('salesHistory:void')!
    voidHandler({}, sale.id, 'First void')

    expect(() => voidHandler({}, sale.id, 'Second attempt')).toThrow(SaleAlreadyVoidError)
  })
```

For `salesHistory:exportCsv`, write this test:

```typescript
  it('salesHistory:exportCsv writes a CSV file to the path the save dialog returns', async () => {
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 5 })
    const sale = completeSale(
      client.db,
      [{ productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 2 }],
      'CASH'
    )
    const listItem = { ...sale, billNumber: 1, itemCount: 1 }
    const tmpPath = path.join(os.tmpdir(), `pos-export-${Date.now()}.csv`)
    ;(dialog.showSaveDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
      canceled: false,
      filePath: tmpPath
    })

    const exportHandler = handlers.get('salesHistory:exportCsv')!
    const result = await exportHandler({}, [listItem])

    expect(result).toEqual({ canceled: false })
    const written = fs.readFileSync(tmpPath, 'utf-8')
    expect(written).toContain('Bill #,Date,Time,Payment Method,Items,Total,Status')
    expect(written).toContain('2x Water')
    fs.rmSync(tmpPath)
  })

  it('salesHistory:exportCsv returns canceled: true and writes nothing when the save dialog is dismissed', async () => {
    ;(dialog.showSaveDialog as ReturnType<typeof vi.fn>).mockResolvedValue({ canceled: true })

    const exportHandler = handlers.get('salesHistory:exportCsv')!
    const result = await exportHandler({}, [])

    expect(result).toEqual({ canceled: true })
  })
```

(These two tests need `path`, `os`, `fs` imported the same way this file already imports them for its DB-file setup — check the existing `beforeEach`/`afterEach` for the exact import style already in this file and match it, rather than adding a second, differently-styled import. `dialog` needs to be imported from `'electron'` at the top of the test file to reference `dialog.showSaveDialog` as a mock — since `electron` is already mocked in this file, importing `{ dialog }` from `'electron'` in the test file gets you the mocked object directly.)

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run src/main/ipc/register-sales-history-handlers.test.ts`
Expected: FAIL — neither handler exists yet.

- [ ] **Step 7: Implement the handlers**

Change `src/main/ipc/register-sales-history-handlers.ts` from:

```typescript
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

to:

```typescript
import { ipcMain, dialog } from 'electron'
import fs from 'node:fs'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { listSales, getSaleWithItems, voidSale } from '../database/repositories/sales-history-repository'
import { toCsv } from '../csv'
import { Money } from '../../shared/money'
import type { SaleListItem } from '../../shared/salesHistory'
import type { SaleRecord } from '../../shared/sale'

export function registerSalesHistoryHandlers(db: BetterSQLite3Database): void {
  ipcMain.handle('salesHistory:list', (): SaleListItem[] => {
    return listSales(db)
  })

  ipcMain.handle('salesHistory:detail', (_event, saleId: string): SaleRecord | null => {
    return getSaleWithItems(db, saleId) ?? null
  })

  ipcMain.handle('salesHistory:void', (_event, saleId: string, reason: string): SaleRecord => {
    return voidSale(db, saleId, reason)
  })

  ipcMain.handle(
    'salesHistory:exportCsv',
    async (_event, salesList: SaleListItem[]): Promise<{ canceled: boolean }> => {
      const result = await dialog.showSaveDialog({
        title: 'Export sales history',
        defaultPath: `sales-history-${new Date().toISOString().slice(0, 10)}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      })
      if (result.canceled || !result.filePath) {
        return { canceled: true }
      }

      const rows = salesList.map((item) => {
        const full = getSaleWithItems(db, item.id)
        const itemsText = full
          ? full.items.map((line) => `${line.quantity}x ${line.productName}`).join('; ')
          : ''
        const date = new Date(item.createdAt)
        return [
          `#${item.billNumber}`,
          date.toLocaleDateString(),
          date.toLocaleTimeString(),
          item.paymentMethod,
          itemsText,
          Money.fromCents(item.totalCents).format(),
          item.status
        ]
      })

      const csv = toCsv(['Bill #', 'Date', 'Time', 'Payment Method', 'Items', 'Total', 'Status'], rows)
      fs.writeFileSync(result.filePath, csv, 'utf-8')

      return { canceled: false }
    }
  )
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/main/ipc/register-sales-history-handlers.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 9: Update the preload bridge**

In `src/preload/index.ts`, change:

```typescript
  salesHistory: {
    list: (): Promise<SaleListItem[]> => ipcRenderer.invoke('salesHistory:list'),
    detail: (saleId: string): Promise<SaleRecord | null> =>
      ipcRenderer.invoke('salesHistory:detail', saleId)
  },
```

to:

```typescript
  salesHistory: {
    list: (): Promise<SaleListItem[]> => ipcRenderer.invoke('salesHistory:list'),
    detail: (saleId: string): Promise<SaleRecord | null> =>
      ipcRenderer.invoke('salesHistory:detail', saleId),
    void: (saleId: string, reason: string): Promise<SaleRecord> =>
      ipcRenderer.invoke('salesHistory:void', saleId, reason),
    exportCsv: (sales: SaleListItem[]): Promise<{ canceled: boolean }> =>
      ipcRenderer.invoke('salesHistory:exportCsv', sales)
  },
```

Apply the identical change to `salesHistory`'s type block in `src/preload/index.d.ts` (same two new method signatures, no implementation bodies there — just the type declarations).

- [ ] **Step 10: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: FAIL at typecheck only if Task 4's renderer code doesn't exist yet referencing these — but since Task 4 hasn't run, nothing should reference `window.api.salesHistory.void`/`exportCsv` yet, so this should already be fully green. If it isn't, stop and investigate before proceeding.

- [ ] **Step 11: Commit**

```bash
git add src/main/csv.ts src/main/csv.test.ts src/main/ipc/register-sales-history-handlers.ts src/main/ipc/register-sales-history-handlers.test.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat: expose void and CSV export over salesHistory IPC"
```

---

### Task 4: Sales History UI — columns, filters, export, and the Void flow

**Files:**
- Create: `src/renderer/src/features/sales-history/VoidSaleModal.tsx`
- Test: `src/renderer/src/features/sales-history/VoidSaleModal.test.tsx`
- Modify: `src/renderer/src/features/sales-history/SalesHistoryPage.tsx`
- Test: `src/renderer/src/features/sales-history/SalesHistoryPage.test.tsx`
- Modify: `src/renderer/src/features/sales-history/SaleDetailModal.tsx`
- Test: `src/renderer/src/features/sales-history/SaleDetailModal.test.tsx`
- Modify: `src/renderer/src/assets/base.css`
- Modify: `src/renderer/src/assets/main.css`

**Interfaces:**
- Consumes: `window.api.salesHistory.void(saleId, reason)` and `window.api.salesHistory.exportCsv(sales)` (Task 3); `SaleListItem`'s extended shape (Task 1).
- Produces: `VoidSaleModal` component with props `{ sale: SaleListItem; submitting: boolean; error: string | null; onConfirm: (reason: string) => void; onCancel: () => void }`.

- [ ] **Step 1: Write the failing test for `VoidSaleModal`**

```typescript
// src/renderer/src/features/sales-history/VoidSaleModal.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VoidSaleModal from './VoidSaleModal'
import type { SaleListItem } from '../../../../shared/salesHistory'

const sale: SaleListItem = {
  id: 'sale-1',
  billNumber: 7,
  totalCents: 4000,
  createdAt: '2026-09-06T10:00:00.000Z',
  itemCount: 2,
  status: 'COMPLETED',
  paymentMethod: 'CASH'
}

describe('VoidSaleModal', () => {
  it('shows the bill number in the title', () => {
    render(<VoidSaleModal sale={sale} submitting={false} error={null} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Void Sale #7' })).toBeInTheDocument()
  })

  it('disables Continue until a reason is typed', async () => {
    const user = userEvent.setup()
    render(<VoidSaleModal sale={sale} submitting={false} error={null} onConfirm={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()

    await user.type(screen.getByLabelText('Reason'), 'Customer changed their mind')

    expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled()
  })

  it('does not call onConfirm directly from the reason step — Continue only advances to the confirm step', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<VoidSaleModal sale={sale} submitting={false} error={null} onConfirm={onConfirm} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText('Reason'), 'Wrong order')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Void Sale' })).toBeInTheDocument()
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument()
  })

  it('calls onConfirm with the trimmed reason only after the explicit confirm step', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<VoidSaleModal sale={sale} submitting={false} error={null} onConfirm={onConfirm} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText('Reason'), '  Wrong order  ')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Void Sale' }))

    expect(onConfirm).toHaveBeenCalledWith('Wrong order')
  })

  it('Back returns to the reason step without losing the typed reason', async () => {
    const user = userEvent.setup()
    render(<VoidSaleModal sale={sale} submitting={false} error={null} onConfirm={vi.fn()} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText('Reason'), 'Wrong order')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.getByLabelText('Reason')).toHaveValue('Wrong order')
  })

  it('calls onCancel from the reason step', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<VoidSaleModal sale={sale} submitting={false} error={null} onConfirm={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('shows an error message when one is given', async () => {
    const user = userEvent.setup()
    render(
      <VoidSaleModal
        sale={sale}
        submitting={false}
        error={'Sale "sale-1" has already been voided'}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    await user.type(screen.getByLabelText('Reason'), 'Wrong order')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByRole('alert')).toHaveTextContent('already been voided')
  })

  it('disables the reason field and buttons while submitting', () => {
    render(<VoidSaleModal sale={sale} submitting={true} error={null} onConfirm={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByLabelText('Reason')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/features/sales-history/VoidSaleModal.test.tsx`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement `VoidSaleModal`**

```typescript
// src/renderer/src/features/sales-history/VoidSaleModal.tsx
import { useEffect, useState } from 'react'
import type { SaleListItem } from '../../../../shared/salesHistory'

export interface VoidSaleModalProps {
  sale: SaleListItem
  submitting: boolean
  error: string | null
  onConfirm: (reason: string) => void
  onCancel: () => void
}

function VoidSaleModal({
  sale,
  submitting,
  error,
  onConfirm,
  onCancel
}: VoidSaleModalProps): React.JSX.Element {
  const [reason, setReason] = useState('')
  const [step, setStep] = useState<'reason' | 'confirm'>('reason')

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !submitting) {
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, submitting])

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget && !submitting) {
      onCancel()
    }
  }

  function handleContinue(event: React.FormEvent): void {
    event.preventDefault()
    if (reason.trim().length === 0) {
      return
    }
    setStep('confirm')
  }

  function handleBack(): void {
    setStep('reason')
  }

  function handleConfirmVoid(): void {
    onConfirm(reason.trim())
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="void-sale-title">
        <h2 id="void-sale-title">{`Void Sale #${sale.billNumber}`}</h2>

        {error && (
          <p role="alert" className="alert alert-danger">
            {error}
          </p>
        )}

        {step === 'reason' ? (
          <form onSubmit={handleContinue}>
            <div className="field">
              <label htmlFor="void-reason">Reason</label>
              <textarea
                id="void-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={submitting}
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onCancel}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting || reason.trim().length === 0}
              >
                Continue
              </button>
            </div>
          </form>
        ) : (
          <>
            <p>Are you sure you want to void this sale? This cannot be undone.</p>
            <p className="void-reason-preview">{`Reason: ${reason.trim()}`}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleBack}
                disabled={submitting}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmVoid}
                disabled={submitting}
              >
                {submitting ? 'Voiding…' : 'Void Sale'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default VoidSaleModal
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/features/sales-history/VoidSaleModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add CSS — `.btn-danger`, badges, filter row**

In `src/renderer/src/assets/base.css`, add a `--color-danger-hover` token right after the existing `--color-danger-soft` line:

```css
  --color-danger-hover: #942f29;
```

In `src/renderer/src/assets/main.css`, add right after the existing `.btn-secondary:hover:not(:disabled)` rule:

```css
.btn-danger {
  background: var(--color-danger);
  color: #fff;
}

.btn-danger:hover:not(:disabled) {
  background: var(--color-danger-hover);
}
```

Add right after the existing `.badge-inactive` rule:

```css
.badge-completed {
  background: var(--color-success-soft);
  color: var(--color-success);
}

.badge-void {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
```

Add near `.products-toolbar` (reusing the same layout rule, just under a new class name for this page's own toolbar):

```css
.sales-history-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.sales-history-toolbar .field {
  gap: 4px;
}

.void-reason-preview {
  color: var(--color-ink-muted);
  font-size: 14px;
}
```

- [ ] **Step 6: Write the failing tests for `SalesHistoryPage`**

Replace `src/renderer/src/features/sales-history/SalesHistoryPage.test.tsx`'s `beforeEach`'s `window.api` assignment — change:

```typescript
    window.api = {
      dbHealth: vi.fn(),
      products: { list: vi.fn(), create: vi.fn(), update: vi.fn(), getByBarcode: vi.fn() },
      sales: { complete: vi.fn() },
      dashboard: {
        summary: vi.fn(),
        topProducts: vi.fn(),
        sevenDaySales: vi.fn(),
        lowStock: vi.fn()
      },
      salesHistory: {
        list: vi.fn().mockResolvedValue(list),
        detail: vi.fn().mockResolvedValue(detail)
      }
    } as unknown as Window['api']
```

to:

```typescript
    window.api = {
      dbHealth: vi.fn(),
      products: { list: vi.fn(), create: vi.fn(), update: vi.fn(), getByBarcode: vi.fn() },
      sales: { complete: vi.fn() },
      dashboard: {
        summary: vi.fn(),
        topProducts: vi.fn(),
        sevenDaySales: vi.fn(),
        lowStock: vi.fn()
      },
      salesHistory: {
        list: vi.fn().mockResolvedValue(list),
        detail: vi.fn().mockResolvedValue(detail),
        void: vi.fn(),
        exportCsv: vi.fn()
      }
    } as unknown as Window['api']
```

Add a second sale to the file's top-level fixtures, right after the existing `list`/`detail` fixtures, giving the new filters something real to narrow:

```typescript
const voidedList: SaleListItem = {
  id: 'sale-2',
  billNumber: 2,
  totalCents: 1000,
  createdAt: '2026-09-04T09:00:00.000Z',
  itemCount: 1,
  status: 'VOID',
  paymentMethod: 'QR'
}
```

Then add these tests to the `describe('SalesHistoryPage', ...)` block:

```typescript
  it('shows Payment Method and Status columns', async () => {
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())

    expect(screen.getByRole('cell', { name: 'CASH' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Completed' })).toBeInTheDocument()
  })

  it('filters by payment method', async () => {
    const user = userEvent.setup()
    ;(window.api.salesHistory.list as ReturnType<typeof vi.fn>).mockResolvedValue([list[0], voidedList])
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())
    expect(screen.getByText('#2')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Filter by payment method'), 'QR')

    expect(screen.queryByText('#1')).not.toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
  })

  it('filters by status', async () => {
    const user = userEvent.setup()
    ;(window.api.salesHistory.list as ReturnType<typeof vi.fn>).mockResolvedValue([list[0], voidedList])
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'VOID')

    expect(screen.queryByText('#1')).not.toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
  })

  it('filters by date range', async () => {
    const user = userEvent.setup()
    ;(window.api.salesHistory.list as ReturnType<typeof vi.fn>).mockResolvedValue([list[0], voidedList])
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())
    // list[0].createdAt is 2026-09-03; voidedList.createdAt is 2026-09-04.
    // A From date of 2026-09-04 must exclude the earlier sale and include
    // the one exactly on the boundary (the filter is inclusive).
    await user.type(screen.getByLabelText('From date'), '2026-09-04')

    expect(screen.queryByText('#1')).not.toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
  })

  it('shows a Void button only on Completed rows', async () => {
    ;(window.api.salesHistory.list as ReturnType<typeof vi.fn>).mockResolvedValue([list[0], voidedList])
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())

    expect(screen.getAllByRole('button', { name: 'Void' })).toHaveLength(1)
  })

  it('voids a sale through the reason-then-confirm flow and reloads the list', async () => {
    const user = userEvent.setup()
    const voided = { ...detail, status: 'VOID', voidReason: 'Wrong order', voidedAt: '2026-09-06T12:00:00.000Z' }
    ;(window.api.salesHistory.void as ReturnType<typeof vi.fn>).mockResolvedValue(voided)
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Void' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.type(screen.getByLabelText('Reason'), 'Wrong order')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Void Sale' }))

    await waitFor(() => expect(window.api.salesHistory.void).toHaveBeenCalledWith('sale-1', 'Wrong order'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(window.api.salesHistory.list).toHaveBeenCalledTimes(2)
  })

  it('shows a clean error in the void modal when voiding fails, without closing it', async () => {
    const user = userEvent.setup()
    ;(window.api.salesHistory.void as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Error invoking remote method 'salesHistory:void': SaleAlreadyVoidError: Sale \"sale-1\" has already been voided")
    )
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Void' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.type(screen.getByLabelText('Reason'), 'Wrong order')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Void Sale' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('already been voided')
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes the void modal without voiding when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Void' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.api.salesHistory.void).not.toHaveBeenCalled()
  })

  it('exports the currently-filtered list as CSV', async () => {
    const user = userEvent.setup()
    ;(window.api.salesHistory.exportCsv as ReturnType<typeof vi.fn>).mockResolvedValue({ canceled: false })
    ;(window.api.salesHistory.list as ReturnType<typeof vi.fn>).mockResolvedValue([list[0], voidedList])
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'VOID')
    await user.click(screen.getByRole('button', { name: 'Export' }))

    await waitFor(() =>
      expect(window.api.salesHistory.exportCsv).toHaveBeenCalledWith([voidedList])
    )
  })
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/src/features/sales-history/SalesHistoryPage.test.tsx`
Expected: FAIL — none of the new columns/filters/buttons exist in `SalesHistoryPage` yet.

- [ ] **Step 8: Rewrite `SalesHistoryPage`**

Replace the whole file:

```typescript
// src/renderer/src/features/sales-history/SalesHistoryPage.tsx
import { useState } from 'react'
import { useSalesHistory } from './useSalesHistory'
import SaleDetailModal from './SaleDetailModal'
import VoidSaleModal from './VoidSaleModal'
import { Money } from '../../../../shared/money'
import type { SaleRecord, PaymentMethod } from '../../../../shared/sale'
import { PAYMENT_METHODS } from '../../../../shared/sale'
import type { SaleListItem } from '../../../../shared/salesHistory'
import { toUserMessage } from '../../lib/ipcError'
import { formatDateTime } from '../../lib/formatDate'

function SalesHistoryPage(): React.JSX.Element {
  const { sales, loading, error, reload } = useSalesHistory()
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [paymentFilter, setPaymentFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [voidTarget, setVoidTarget] = useState<SaleListItem | null>(null)
  const [voiding, setVoiding] = useState(false)
  const [voidError, setVoidError] = useState<string | null>(null)

  const filteredSales = sales.filter((sale) => {
    if (paymentFilter && sale.paymentMethod !== paymentFilter) {
      return false
    }
    if (statusFilter && sale.status !== statusFilter) {
      return false
    }
    // Compare by calendar day only, in local time — matching how the
    // date inputs themselves collect a plain YYYY-MM-DD with no time
    // component, not an exact instant.
    const saleDay = sale.createdAt.slice(0, 10)
    if (fromDate && saleDay < fromDate) {
      return false
    }
    if (toDate && saleDay > toDate) {
      return false
    }
    return true
  })

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
      setDetailError(toUserMessage(err))
    }
  }

  function handleVoidClick(sale: SaleListItem): void {
    setVoidError(null)
    setVoidTarget(sale)
  }

  function handleVoidCancel(): void {
    setVoidTarget(null)
  }

  async function handleVoidConfirm(reason: string): Promise<void> {
    if (!voidTarget) {
      return
    }
    setVoiding(true)
    try {
      await window.api.salesHistory.void(voidTarget.id, reason)
      setVoidTarget(null)
      setVoidError(null)
      await reload()
    } catch (err) {
      setVoidError(toUserMessage(err))
    } finally {
      setVoiding(false)
    }
  }

  async function handleExport(): Promise<void> {
    await window.api.salesHistory.exportCsv(filteredSales)
  }

  return (
    <div className="products-page">
      <div className="products-header">
        <h1>Sales History</h1>
        <div className="sales-history-toolbar">
          <div className="field">
            <label htmlFor="sales-history-payment-filter">Filter by payment method</label>
            <select
              id="sales-history-payment-filter"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
            >
              <option value="">All</option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sales-history-status-filter">Filter by status</label>
            <select
              id="sales-history-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All</option>
              <option value="COMPLETED">Completed</option>
              <option value="VOID">Void</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="sales-history-from-date">From date</label>
            <input
              id="sales-history-from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="sales-history-to-date">To date</label>
            <input
              id="sales-history-to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <button type="button" className="btn btn-secondary" onClick={handleExport}>
            Export
          </button>
        </div>
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
        ) : filteredSales.length === 0 ? (
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
                <th>Payment Method</th>
                <th>Status</th>
                <th className="col-price">Total</th>
                <th className="col-stock">Items</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.map((sale) => (
                <tr key={sale.id}>
                  <td>#{sale.billNumber}</td>
                  <td>{formatDateTime(sale.createdAt)}</td>
                  <td>{sale.paymentMethod}</td>
                  <td>
                    <span className={`badge ${sale.status === 'VOID' ? 'badge-void' : 'badge-completed'}`}>
                      {sale.status === 'VOID' ? 'Void' : 'Completed'}
                    </span>
                  </td>
                  <td className="cell-price">{Money.fromCents(sale.totalCents).format()}</td>
                  <td className="cell-stock">{sale.itemCount}</td>
                  <td className="cell-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleView(sale.id)}
                    >
                      View
                    </button>
                    {sale.status !== 'VOID' && (
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => handleVoidClick(sale)}
                      >
                        Void
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedSale && (
        <SaleDetailModal sale={selectedSale} onClose={() => setSelectedSale(null)} />
      )}

      {voidTarget && (
        <VoidSaleModal
          sale={voidTarget}
          submitting={voiding}
          error={voidError}
          onConfirm={handleVoidConfirm}
          onCancel={handleVoidCancel}
        />
      )}
    </div>
  )
}

export default SalesHistoryPage
```

(`PAYMENT_METHODS` is the shared const tuple `['CASH', 'QR', 'CARD']` from `src/shared/sale.ts`, added in Phase 8's final-review fix wave and already the single source of truth `PaymentMethodModal.tsx` reads from — reuse it here rather than hand-writing the three literals a fourth time. The unused `PaymentMethod` type import above is intentional — TypeScript needs it for `PAYMENT_METHODS`'s inferred element type to line up with `sale.paymentMethod`'s type in the `<option>` loop's `key`; if your editor/linter flags it as unused after writing this file, it means the type is structurally inferred without needing the explicit import — remove that one import line in that case, but leave `PAYMENT_METHODS` itself imported as a value.)

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/src/features/sales-history/SalesHistoryPage.test.tsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 10: Write the failing test for `SaleDetailModal`'s void info**

Add to `src/renderer/src/features/sales-history/SaleDetailModal.test.tsx`:

```typescript
  it('shows the void reason and timestamp for a voided sale', () => {
    const voidedSale: SaleRecord = {
      ...sale,
      status: 'VOID',
      voidReason: 'Customer changed their mind',
      voidedAt: '2026-09-06T12:00:00.000Z'
    }
    render(<SaleDetailModal sale={voidedSale} onClose={vi.fn()} />)

    expect(screen.getByText(/Customer changed their mind/)).toBeInTheDocument()
  })

  it('shows no void information for a completed sale', () => {
    render(<SaleDetailModal sale={sale} onClose={vi.fn()} />)

    expect(screen.queryByText(/Voided/)).not.toBeInTheDocument()
  })
```

(This file's own `sale: SaleRecord` fixture — used by these two new tests via `{...sale, ...}` and directly — already has `status: 'COMPLETED'` from Phase 8 and no `voidReason`/`voidedAt`, which is exactly what the second test needs; no fixture change required.)

- [ ] **Step 11: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/features/sales-history/SaleDetailModal.test.tsx`
Expected: FAIL — nothing renders void info yet.

- [ ] **Step 12: Show void info in `SaleDetailModal`**

Change the line right after `<p className="sale-detail-meta">{formatDateTime(sale.createdAt)}</p>` — add:

```typescript
        {sale.status === 'VOID' && sale.voidReason && (
          <p role="alert" className="alert alert-danger">
            {`Voided ${sale.voidedAt ? formatDateTime(sale.voidedAt) : ''} — ${sale.voidReason}`}
          </p>
        )}
```

- [ ] **Step 13: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/features/sales-history/SaleDetailModal.test.tsx`
Expected: PASS.

- [ ] **Step 14: Run the full suite, typecheck, and lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS / 0 errors — this is the last task of the phase, so the whole branch should be green here.

- [ ] **Step 15: Commit**

```bash
git add src/renderer/src/features/sales-history/VoidSaleModal.tsx src/renderer/src/features/sales-history/VoidSaleModal.test.tsx src/renderer/src/features/sales-history/SalesHistoryPage.tsx src/renderer/src/features/sales-history/SalesHistoryPage.test.tsx src/renderer/src/features/sales-history/SaleDetailModal.tsx src/renderer/src/features/sales-history/SaleDetailModal.test.tsx src/renderer/src/assets/base.css src/renderer/src/assets/main.css
git commit -m "feat: add payment/status/date filters, CSV export, and a real Void action to Sales History"
```
