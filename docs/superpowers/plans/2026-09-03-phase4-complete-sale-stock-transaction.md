# Phase 4: Complete Sale + Stock Transaction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Finish Sale" action to the POS screen that atomically commits the current cart as a completed sale — writing `sales`, `sale_items`, and `stock_transactions` rows and decrementing `products.stock` — with an all-or-nothing guarantee and a hard floor at zero stock.

**Architecture:** A new `sale-repository.ts` wraps the whole write in a single synchronous `db.transaction()` (better-sqlite3 + Drizzle). It re-checks each line's current stock against the live `products` row inside the transaction (not the renderer's cached value) and throws before any write if any line would oversell; the throw rolls the whole transaction back automatically. A new IPC channel (`sales:complete`) and preload method expose this to the renderer. A `useCompleteSale` hook maps the Zustand cart into the wire format, calls it, clears the cart on success, and surfaces errors the same way `useProducts` already does. `PosPage` gains a "Finish Sale" button and a success banner, per the spec's `Commit → Clear Cart + Show Success` flow.

**Tech Stack:** Electron main process (Drizzle ORM / better-sqlite3), IPC (`ipcMain.handle` / `contextBridge`), React 19 renderer, Zustand cart store, Vitest + React Testing Library.

## Global Constraints

- Money is always an integer number of satang; use `src/shared/money.ts`'s `Money` for any arithmetic that touches a price or total — never raw `+`/`*` on cents.
- The renderer must never import `better-sqlite3`/`drizzle-orm` or anything under `src/main/**` — all DB access crosses the `window.api` IPC boundary (enforced by `no-restricted-imports` in `eslint.config.mjs`).
- `src/shared/**` must not import from `src/main/**` (dependency direction is main → shared, not the reverse).
- better-sqlite3 is a synchronous driver: `db.transaction(callback)` requires a fully synchronous callback — no `async`/`await` inside it. Throwing inside the callback rolls the whole transaction back; this is the only rollback mechanism to use.
- Cart state lives only in the existing `useCartStore` (Zustand) — do not introduce a second store.
- Whoever writes a change writes its test in the same task: cover positive, negative, and edge paths, and assert real outcomes (no "it didn't throw" tests).
- Follow the codebase's established conventions: `XxxError extends Error` with a `.name` override for domain errors; repository functions take `db` as their first parameter; IPC handlers are thin (`ipcMain.handle(channel, (_event, ...args) => repositoryFn(db, ...args))`); the renderer never sees a raw thrown Electron IPC error message (strip it via the existing `toUserMessage` pattern).

---

## Relevant spec excerpts (for context, not to be re-typed anywhere)

- User Flow (spec §5): `SCAN → Lookup Product by Barcode → Add/Increment Cart Item → Calculate Line Total + Cart Total → Finish Sale → DB Transaction {INSERT sales, INSERT sale_items, UPDATE products.stock, INSERT stock_transactions} → Commit → Clear Cart + Show Success`. Any error mid-transaction: roll back the whole batch, never leave stock half-changed.
- §6.3 Checkout & Stock: Finish Sale must be atomic; never create a Sale successfully while failing to deduct stock; stock must never go negative under the default policy; a `stock_transactions` row is created every time stock is cut or adjusted.
- §11 Transaction & Stock Consistency table: insufficient stock → reject the sale, change nothing; DB error → roll back every operation in the transaction; a price change after the fact must not alter an already-completed sale's snapshot.
- §15 Roadmap, Phase 4 exit criteria: "ขายแล้ว Stock ลดแบบ atomic" (after a sale, stock decreases atomically).
- §14.1 Critical test cases relevant to this phase: multi-product single sale; stock = 1, sell 2 → must reject; a mid-transaction failure must not leave Sale/Stock half-committed.

The `sales`, `sale_items`, and `stock_transactions` Drizzle tables and their migration already exist (added in Phase 1, unused until now) — see `src/main/database/schema.ts:31-61` and `drizzle/0000_petite_scream.sql`. **No schema or migration changes are needed in this phase.**

## Design decision: where the sale-item price/name snapshot comes from

The cart (`CartItem`, from Phase 3) already snapshots `unitPriceCents` and `name` at scan time, and that snapshot is what the cashier sees as the running "Total" on the POS screen. To avoid the sale ever charging a different amount than what was displayed and agreed with the customer, `completeSale` takes the price/name **from the renderer's cart line**, not from a fresh DB read — it re-reads the DB only to authoritatively check and decrement **stock** (the one field that must never be trusted from a stale client cache). This matches every other repository in this codebase (e.g. `createProduct` already trusts caller-supplied `priceCents` outright) and is consistent with the single-device, single-trusted-operator MVP threat model in spec §13.

---

## File Structure

- Create: `src/shared/sale.ts` — wire types shared between main and renderer (`SaleLineInput`, `SaleItemRecord`, `SaleRecord`).
- Create: `src/main/database/repositories/sale-repository.ts` — `completeSale(db, items)`, the atomic transaction, and its domain errors.
- Create: `src/main/database/repositories/sale-repository.test.ts`
- Create: `src/main/ipc/register-sale-handlers.ts` — registers `sales:complete`.
- Create: `src/main/ipc/register-sale-handlers.test.ts`
- Modify: `src/main/index.ts` — register the new handler alongside `registerProductHandlers`.
- Modify: `src/preload/index.ts` — expose `api.sales.complete`.
- Modify: `src/preload/index.d.ts` — type `window.api.sales`.
- Create: `src/renderer/src/lib/ipcError.ts` — the `toUserMessage` helper, extracted out of `useProducts.ts` so `useCompleteSale` can share it (DRY: this is the exact same helper, needed identically in a second hook).
- Modify: `src/renderer/src/features/products/useProducts.ts` — import `toUserMessage` from the new shared module instead of defining it locally.
- Create: `src/renderer/src/features/cart/useCompleteSale.ts` — maps the cart to `SaleLineInput[]`, calls `window.api.sales.complete`, clears the cart on success.
- Create: `src/renderer/src/features/cart/useCompleteSale.test.ts`
- Modify: `src/renderer/src/features/cart/PosPage.tsx` — "Finish Sale" button + success banner.
- Modify: `src/renderer/src/features/cart/PosPage.test.tsx` — mock `window.api.sales`, add Finish Sale tests.
- Modify: `src/renderer/src/App.test.tsx` — extend the `window.api` mock shape to include `sales` (kept in sync with the real `Window['api']` type; not otherwise exercised by App's own tests).
- Modify: `src/renderer/src/assets/main.css` — `.alert-success`, and a `gap` on `.pos-footer` now that it holds two buttons.

---

### Task 1: Sale repository — atomic `completeSale`

**Files:**
- Create: `src/shared/sale.ts`
- Create: `src/main/database/repositories/sale-repository.ts`
- Test: `src/main/database/repositories/sale-repository.test.ts`

**Interfaces:**
- Consumes: `products`, `sales`, `saleItems`, `stockTransactions` tables from `src/main/database/schema.ts`; `ProductNotFoundError` from `./product-repository.ts`; `createDbClient`/`DbClient` from `../client.ts` (test only).
- Produces (for Task 2 and later tasks to import):
  - `src/shared/sale.ts`: `interface SaleLineInput { productId: string; productName: string; unitPriceCents: number; quantity: number }`, `interface SaleItemRecord { id: string; saleId: string; productId: string; productName: string; priceCents: number; quantity: number; totalCents: number }`, `interface SaleRecord { id: string; totalCents: number; status: string; createdAt: string; items: SaleItemRecord[] }`.
  - `src/main/database/repositories/sale-repository.ts`: `function completeSale(db: BetterSQLite3Database, items: SaleLineInput[]): SaleRecord`, `class EmptyCartError extends Error`, `class InsufficientStockError extends Error`.

- [ ] **Step 1: Write the shared sale types**

```typescript
// src/shared/sale.ts
export interface SaleLineInput {
  productId: string
  productName: string
  unitPriceCents: number
  quantity: number
}

export interface SaleItemRecord {
  id: string
  saleId: string
  productId: string
  productName: string
  priceCents: number
  quantity: number
  totalCents: number
}

export interface SaleRecord {
  id: string
  totalCents: number
  status: string
  createdAt: string
  items: SaleItemRecord[]
}
```

- [ ] **Step 2: Write the failing repository tests**

```typescript
// src/main/database/repositories/sale-repository.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { eq } from 'drizzle-orm'
import { createDbClient, type DbClient } from '../client'
import { products, sales, saleItems, stockTransactions } from '../schema'
import { createProduct } from './product-repository'
import { completeSale, EmptyCartError, InsufficientStockError } from './sale-repository'
import type { SaleLineInput } from '../../../shared/sale'

describe('completeSale', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-sale-repo-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('completes a single-line sale: decrements stock, records the sale, item, and stock transaction', () => {
    const coke = createProduct(client.db, {
      barcode: '111',
      name: 'Coca Cola',
      priceCents: 2000,
      stock: 5
    })

    const line: SaleLineInput = {
      productId: coke.id,
      productName: coke.name,
      unitPriceCents: coke.priceCents,
      quantity: 2
    }
    const sale = completeSale(client.db, [line])

    expect(sale.status).toBe('COMPLETED')
    expect(sale.totalCents).toBe(4000)
    expect(sale.items).toHaveLength(1)
    expect(sale.items[0]).toMatchObject({
      saleId: sale.id,
      productId: coke.id,
      productName: 'Coca Cola',
      priceCents: 2000,
      quantity: 2,
      totalCents: 4000
    })

    const updatedProduct = client.db.select().from(products).where(eq(products.id, coke.id)).get()
    expect(updatedProduct?.stock).toBe(3)

    const stockTxns = client.db
      .select()
      .from(stockTransactions)
      .where(eq(stockTransactions.productId, coke.id))
      .all()
    expect(stockTxns).toHaveLength(1)
    expect(stockTxns[0]).toMatchObject({
      type: 'SALE',
      quantity: -2,
      referenceId: sale.id
    })
  })

  it('completes a multi-line sale and sums the total across lines', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 10 })
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 10 })

    const sale = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 2 },
      { productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 3 }
    ])

    expect(sale.totalCents).toBe(2000 * 2 + 1000 * 3)
    expect(sale.items).toHaveLength(2)

    const savedItems = client.db.select().from(saleItems).where(eq(saleItems.saleId, sale.id)).all()
    expect(savedItems).toHaveLength(2)
  })

  it('rejects an empty cart without writing anything', () => {
    expect(() => completeSale(client.db, [])).toThrow(EmptyCartError)
    expect(client.db.select().from(sales).all()).toHaveLength(0)
  })

  it('rejects a line that would oversell stock, and rolls back the entire sale', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 5 })
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 1 })

    expect(() =>
      completeSale(client.db, [
        { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 2 },
        { productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 2 }
      ])
    ).toThrow(InsufficientStockError)

    // Nothing committed at all — including the first, individually-valid line.
    expect(client.db.select().from(sales).all()).toHaveLength(0)
    expect(client.db.select().from(saleItems).all()).toHaveLength(0)
    expect(client.db.select().from(stockTransactions).all()).toHaveLength(0)

    const cokeAfter = client.db.select().from(products).where(eq(products.id, coke.id)).get()
    expect(cokeAfter?.stock).toBe(5)
  })

  it('rejects selling exactly one more unit than is in stock', () => {
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 1 })

    expect(() =>
      completeSale(client.db, [
        { productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 2 }
      ])
    ).toThrow(InsufficientStockError)
  })

  it('allows selling exactly the remaining stock down to zero', () => {
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 2 })

    const sale = completeSale(client.db, [
      { productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 2 }
    ])

    expect(sale.totalCents).toBe(2000)
    const after = client.db.select().from(products).where(eq(products.id, water.id)).get()
    expect(after?.stock).toBe(0)
  })

  it('keeps the sale_items price snapshot unchanged after the product price is edited later (spec §14.1)', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 5 })

    const sale = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 }
    ])
    expect(sale.items[0].priceCents).toBe(2000)

    client.db
      .update(products)
      .set({ priceCents: 3500 })
      .where(eq(products.id, coke.id))
      .run()

    const persistedItem = client.db
      .select()
      .from(saleItems)
      .where(eq(saleItems.saleId, sale.id))
      .get()
    expect(persistedItem?.priceCents).toBe(2000)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- sale-repository`
Expected: FAIL — `sale-repository.ts` does not exist yet (module not found).

- [ ] **Step 4: Implement `completeSale`**

```typescript
// src/main/database/repositories/sale-repository.ts
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { products, sales, saleItems, stockTransactions } from '../schema'
import type { SaleLineInput, SaleItemRecord, SaleRecord } from '../../../shared/sale'
import { Money } from '../../../shared/money'
import { ProductNotFoundError } from './product-repository'

export class EmptyCartError extends Error {
  constructor() {
    super('Cannot complete a sale with an empty cart')
    this.name = 'EmptyCartError'
  }
}

export class InsufficientStockError extends Error {
  constructor(productName: string, available: number, requested: number) {
    super(`Not enough stock for "${productName}": ${available} available, ${requested} requested`)
    this.name = 'InsufficientStockError'
  }
}

function validateLine(line: SaleLineInput): void {
  if (!line.productId || line.productId.trim().length === 0) {
    throw new Error('Sale line is missing a product id')
  }
  if (!Number.isInteger(line.quantity) || line.quantity < 1) {
    throw new Error(`Sale line quantity must be a positive integer, got ${line.quantity}`)
  }
  if (!Number.isInteger(line.unitPriceCents) || line.unitPriceCents < 0) {
    throw new Error(`Sale line price must be a non-negative integer, got ${line.unitPriceCents}`)
  }
}

export function completeSale(db: BetterSQLite3Database, items: SaleLineInput[]): SaleRecord {
  if (items.length === 0) {
    throw new EmptyCartError()
  }
  items.forEach(validateLine)

  // better-sqlite3 transactions are synchronous: this whole callback runs
  // inside one BEGIN/COMMIT, and throwing anywhere in it rolls everything
  // back, including writes made earlier in the same callback (spec §6.3 /
  // §11: never create a Sale successfully while failing to cut stock, and
  // never leave stock half-changed after a mid-transaction failure).
  return db.transaction((tx) => {
    const now = new Date().toISOString()
    const saleId = randomUUID()
    let total = Money.fromCents(0)

    const itemRecords: SaleItemRecord[] = items.map((line) => {
      const product = tx.select().from(products).where(eq(products.id, line.productId)).get()
      if (!product) {
        throw new ProductNotFoundError(line.productId)
      }
      if (product.stock < line.quantity) {
        throw new InsufficientStockError(line.productName, product.stock, line.quantity)
      }

      // Global Constraints: money math always goes through Money, never raw
      // +/* on cents.
      const lineTotal = Money.fromCents(line.unitPriceCents).multiply(line.quantity)
      const lineTotalCents = lineTotal.cents
      total = total.add(lineTotal)

      tx.update(products)
        .set({ stock: product.stock - line.quantity, updatedAt: now })
        .where(eq(products.id, line.productId))
        .run()

      // Negative quantity: this row records a deduction. Summing every
      // stock_transactions row for a product reconstructs its net stock
      // change from zero, so the sign must be consistent for future
      // (Phase 5+) audit/reporting queries.
      tx.insert(stockTransactions)
        .values({
          id: randomUUID(),
          productId: line.productId,
          type: 'SALE',
          quantity: -line.quantity,
          referenceId: saleId,
          createdAt: now
        })
        .run()

      return {
        id: randomUUID(),
        saleId,
        productId: line.productId,
        productName: line.productName,
        priceCents: line.unitPriceCents,
        quantity: line.quantity,
        totalCents: lineTotalCents
      }
    })

    tx.insert(sales)
      .values({ id: saleId, totalCents: total.cents, status: 'COMPLETED', createdAt: now })
      .run()

    itemRecords.forEach((item) => {
      tx.insert(saleItems).values(item).run()
    })

    return { id: saleId, totalCents: total.cents, status: 'COMPLETED', createdAt: now, items: itemRecords }
  })
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- sale-repository`
Expected: PASS, all 7 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/shared/sale.ts src/main/database/repositories/sale-repository.ts src/main/database/repositories/sale-repository.test.ts
git commit -m "feat: add atomic completeSale repository function"
```

---

### Task 2: IPC handler + preload wiring

**Files:**
- Create: `src/main/ipc/register-sale-handlers.ts`
- Test: `src/main/ipc/register-sale-handlers.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

**Interfaces:**
- Consumes: `completeSale` from `../database/repositories/sale-repository.ts` (Task 1); `SaleLineInput`, `SaleRecord` from `../../shared/sale.ts` (Task 1).
- Produces: IPC channel `sales:complete` (renderer → main, args `(items: SaleLineInput[])`, returns `SaleRecord` or rejects); `window.api.sales.complete(items: SaleLineInput[]): Promise<SaleRecord>` for Task 3/4 to call.

- [ ] **Step 1: Write the failing IPC handler test**

```typescript
// src/main/ipc/register-sale-handlers.test.ts
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

import { registerSaleHandlers } from './register-sale-handlers'
import { createDbClient, type DbClient } from '../database/client'
import { createProduct } from '../database/repositories/product-repository'
import type { SaleLineInput, SaleRecord } from '../../shared/sale'

describe('registerSaleHandlers', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    handlers.clear()
    dbFile = path.join(os.tmpdir(), `pos-ipc-sales-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../drizzle'))
    registerSaleHandlers(client.db)
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('registers sales:complete', () => {
    expect(handlers.has('sales:complete')).toBe(true)
  })

  it('sales:complete completes a sale and decrements stock', () => {
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 5 })
    const completeHandler = handlers.get('sales:complete')!

    const line: SaleLineInput = {
      productId: water.id,
      productName: water.name,
      unitPriceCents: water.priceCents,
      quantity: 2
    }
    const sale = completeHandler({}, [line]) as SaleRecord

    expect(sale.totalCents).toBe(2000)
    expect(sale.items).toHaveLength(1)
  })

  it('sales:complete propagates an error for an insufficient-stock line', () => {
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 1 })
    const completeHandler = handlers.get('sales:complete')!

    const line: SaleLineInput = {
      productId: water.id,
      productName: water.name,
      unitPriceCents: water.priceCents,
      quantity: 2
    }
    expect(() => completeHandler({}, [line])).toThrow()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- register-sale-handlers`
Expected: FAIL — `register-sale-handlers.ts` does not exist yet.

- [ ] **Step 3: Implement the IPC handler**

```typescript
// src/main/ipc/register-sale-handlers.ts
import { ipcMain } from 'electron'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { completeSale } from '../database/repositories/sale-repository'
import type { SaleLineInput, SaleRecord } from '../../shared/sale'

export function registerSaleHandlers(db: BetterSQLite3Database): void {
  ipcMain.handle('sales:complete', (_event, items: SaleLineInput[]): SaleRecord => {
    return completeSale(db, items)
  })
}
```

- [ ] **Step 4: Wire it into `main/index.ts`**

In `src/main/index.ts`, add the import next to the existing `registerProductHandlers` import:

```typescript
import { registerProductHandlers } from './ipc/register-product-handlers'
import { registerSaleHandlers } from './ipc/register-sale-handlers'
```

And call it right after `registerProductHandlers(dbClient.db)`:

```typescript
  registerProductHandlers(dbClient.db)
  registerSaleHandlers(dbClient.db)
```

- [ ] **Step 5: Expose it through the preload script**

In `src/preload/index.ts`, add the import and extend the `api` object:

```typescript
import type {
  CreateProductInput,
  ProductRecord,
  UpdateProductInput
} from '../shared/product'
import type { SaleLineInput, SaleRecord } from '../shared/sale'
```

```typescript
const api = {
  dbHealth: (): Promise<{ productCount: number }> => ipcRenderer.invoke('db:health'),
  products: {
    list: (query?: string): Promise<ProductRecord[]> => ipcRenderer.invoke('products:list', query),
    create: (input: CreateProductInput): Promise<ProductRecord> =>
      ipcRenderer.invoke('products:create', input),
    update: (id: string, input: UpdateProductInput): Promise<ProductRecord> =>
      ipcRenderer.invoke('products:update', id, input),
    getByBarcode: (barcode: string): Promise<ProductRecord | null> =>
      ipcRenderer.invoke('products:getByBarcode', barcode)
  },
  sales: {
    complete: (items: SaleLineInput[]): Promise<SaleRecord> =>
      ipcRenderer.invoke('sales:complete', items)
  }
}
```

- [ ] **Step 6: Type it in `src/preload/index.d.ts`**

```typescript
import { ElectronAPI } from '@electron-toolkit/preload'
import type { CreateProductInput, ProductRecord, UpdateProductInput } from '../shared/product'
import type { SaleLineInput, SaleRecord } from '../shared/sale'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      dbHealth: () => Promise<{ productCount: number }>
      products: {
        list: (query?: string) => Promise<ProductRecord[]>
        create: (input: CreateProductInput) => Promise<ProductRecord>
        update: (id: string, input: UpdateProductInput) => Promise<ProductRecord>
        getByBarcode: (barcode: string) => Promise<ProductRecord | null>
      }
      sales: {
        complete: (items: SaleLineInput[]) => Promise<SaleRecord>
      }
    }
  }
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -- register-sale-handlers`
Expected: PASS, all 3 tests green.

- [ ] **Step 8: Run the full suite and typecheck**

Run: `npm test && npm run typecheck` (use whatever the exact script names are in `package.json` — confirm with `cat package.json` if unsure)
Expected: PASS. No regressions in `register-product-handlers.test.ts` or elsewhere.

- [ ] **Step 9: Commit**

```bash
git add src/main/ipc/register-sale-handlers.ts src/main/ipc/register-sale-handlers.test.ts src/main/index.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat: expose sales:complete over IPC and preload"
```

---

### Task 3: `useCompleteSale` hook (+ shared `toUserMessage` extraction)

**Files:**
- Create: `src/renderer/src/lib/ipcError.ts`
- Modify: `src/renderer/src/features/products/useProducts.ts`
- Create: `src/renderer/src/features/cart/useCompleteSale.ts`
- Test: `src/renderer/src/features/cart/useCompleteSale.test.ts`

**Interfaces:**
- Consumes: `useCartStore` (`items`, `clear`) from `./cartStore.ts`; `SaleLineInput`, `SaleRecord` from `../../../../shared/sale.ts`; `window.api.sales.complete` from Task 2.
- Produces: `toUserMessage(err: unknown): string` from `src/renderer/src/lib/ipcError.ts` (for Task 4 and `useProducts.ts` to share); `function useCompleteSale(): { completing: boolean; error: string | null; completeSale: () => Promise<SaleRecord | null> }` for Task 4 to consume. `completeSale()` resolves to `null` (without calling the IPC layer) when the cart is empty, and also to `null` (after setting `error`) if the IPC call rejects.

- [ ] **Step 1: Extract the shared `toUserMessage` helper**

```typescript
// src/renderer/src/lib/ipcError.ts

// When a listener registered with `ipcMain.handle` throws, Electron's
// `ipcRenderer.invoke` rejects with a message wrapped like:
//   Error invoking remote method 'products:create': DuplicateBarcodeError: A product with barcode "999" already exists
// (the invoke-wrapper prefix, followed by `${error.name}: ${error.message}`
// from the thrown Error's own `toString()`). Neither half is something the
// shop owner should ever see — strip both so only the original, human
// -readable message reaches the UI.
export function toUserMessage(err: unknown): string {
  if (!(err instanceof Error)) {
    return String(err)
  }
  return err.message
    .replace(/^Error invoking remote method '[^']*':\s*/, '')
    .replace(/^[A-Za-z][\w]*:\s*/, '')
}
```

- [ ] **Step 2: Point `useProducts.ts` at the shared helper**

In `src/renderer/src/features/products/useProducts.ts`, delete the local `toUserMessage` function (lines 15-22) and its preceding comment, and add an import instead:

```typescript
import { toUserMessage } from '../../lib/ipcError'
```

- [ ] **Step 3: Run the existing product tests to confirm nothing broke**

Run: `npm test -- useProducts`
Expected: PASS — behavior is unchanged, only the helper's location moved.

- [ ] **Step 4: Write the failing `useCompleteSale` tests**

```typescript
// src/renderer/src/features/cart/useCompleteSale.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useCompleteSale } from './useCompleteSale'
import { useCartStore } from './cartStore'
import type { SaleRecord } from '../../../../shared/sale'

const coke = { productId: '1', barcode: '111', name: 'Coke', unitPriceCents: 2000, stock: 5, quantity: 2 }

describe('useCompleteSale', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [] })
    window.api = {
      dbHealth: vi.fn(),
      products: { list: vi.fn(), create: vi.fn(), update: vi.fn(), getByBarcode: vi.fn() },
      sales: { complete: vi.fn() }
    } as unknown as Window['api']
  })

  it('maps the cart to sale lines, completes the sale, and clears the cart', async () => {
    useCartStore.setState({ items: [coke] })
    const sale: SaleRecord = {
      id: 'sale-1',
      totalCents: 4000,
      status: 'COMPLETED',
      createdAt: '2026-09-03T00:00:00.000Z',
      items: [
        {
          id: 'item-1',
          saleId: 'sale-1',
          productId: '1',
          productName: 'Coke',
          priceCents: 2000,
          quantity: 2,
          totalCents: 4000
        }
      ]
    }
    ;(window.api.sales.complete as ReturnType<typeof vi.fn>).mockResolvedValue(sale)

    const { result } = renderHook(() => useCompleteSale())

    let returned: SaleRecord | null = null
    await act(async () => {
      returned = await result.current.completeSale()
    })

    expect(window.api.sales.complete).toHaveBeenCalledWith([
      { productId: '1', productName: 'Coke', unitPriceCents: 2000, quantity: 2 }
    ])
    expect(returned).toEqual(sale)
    expect(useCartStore.getState().items).toHaveLength(0)
    expect(result.current.error).toBeNull()
  })

  it('does nothing and returns null when the cart is empty', async () => {
    const { result } = renderHook(() => useCompleteSale())

    let returned: SaleRecord | null = null
    await act(async () => {
      returned = await result.current.completeSale()
    })

    expect(returned).toBeNull()
    expect(window.api.sales.complete).not.toHaveBeenCalled()
  })

  it('surfaces a clean error message and keeps the cart when the sale is rejected', async () => {
    useCartStore.setState({ items: [coke] })
    ;(window.api.sales.complete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error(
        'Error invoking remote method \'sales:complete\': InsufficientStockError: Not enough stock for "Coke": 1 available, 2 requested'
      )
    )

    const { result } = renderHook(() => useCompleteSale())

    await act(async () => {
      await result.current.completeSale()
    })

    await waitFor(() =>
      expect(result.current.error).toBe('Not enough stock for "Coke": 1 available, 2 requested')
    )
    expect(useCartStore.getState().items).toHaveLength(1)
  })

  it('sets completing to true while the call is in flight', async () => {
    useCartStore.setState({ items: [coke] })
    let resolveCall: (value: SaleRecord) => void = () => {}
    ;(window.api.sales.complete as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        resolveCall = resolve
      })
    )

    const { result } = renderHook(() => useCompleteSale())

    let callPromise!: Promise<SaleRecord | null>
    act(() => {
      callPromise = result.current.completeSale()
    })

    await waitFor(() => expect(result.current.completing).toBe(true))

    resolveCall({
      id: 'sale-1',
      totalCents: 4000,
      status: 'COMPLETED',
      createdAt: '2026-09-03T00:00:00.000Z',
      items: []
    })
    await act(async () => {
      await callPromise
    })

    expect(result.current.completing).toBe(false)
  })
})
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npm test -- useCompleteSale`
Expected: FAIL — `useCompleteSale.ts` does not exist yet.

- [ ] **Step 6: Implement `useCompleteSale`**

```typescript
// src/renderer/src/features/cart/useCompleteSale.ts
import { useCallback, useState } from 'react'
import { useCartStore } from './cartStore'
import type { SaleLineInput, SaleRecord } from '../../../../shared/sale'
import { toUserMessage } from '../../lib/ipcError'

export interface UseCompleteSaleResult {
  completing: boolean
  error: string | null
  completeSale: () => Promise<SaleRecord | null>
}

export function useCompleteSale(): UseCompleteSaleResult {
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const completeSale = useCallback(async (): Promise<SaleRecord | null> => {
    const items = useCartStore.getState().items
    if (items.length === 0) {
      return null
    }

    const lines: SaleLineInput[] = items.map((item) => ({
      productId: item.productId,
      productName: item.name,
      unitPriceCents: item.unitPriceCents,
      quantity: item.quantity
    }))

    setCompleting(true)
    setError(null)
    try {
      const sale = await window.api.sales.complete(lines)
      useCartStore.getState().clear()
      return sale
    } catch (err) {
      setError(toUserMessage(err))
      return null
    } finally {
      setCompleting(false)
    }
  }, [])

  return { completing, error, completeSale }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- useCompleteSale`
Expected: PASS, all 4 tests green.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/lib/ipcError.ts src/renderer/src/features/products/useProducts.ts src/renderer/src/features/cart/useCompleteSale.ts src/renderer/src/features/cart/useCompleteSale.test.ts
git commit -m "feat: add useCompleteSale hook and extract shared toUserMessage helper"
```

---

### Task 4: "Finish Sale" button + success banner on `PosPage`

**Files:**
- Modify: `src/renderer/src/features/cart/PosPage.tsx`
- Modify: `src/renderer/src/features/cart/PosPage.test.tsx`
- Modify: `src/renderer/src/App.test.tsx`
- Modify: `src/renderer/src/assets/main.css`

**Interfaces:**
- Consumes: `useCompleteSale` from `./useCompleteSale.ts` (Task 3); `Money` from `../../../../shared/money.ts` (existing).
- Produces: no new exports — this is the final, user-facing integration point for the phase.

- [ ] **Step 1: Write the failing `PosPage` tests**

In `src/renderer/src/features/cart/PosPage.test.tsx`, update the `beforeEach` mock to include `sales`, and add new tests. Replace the whole file with:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PosPage from './PosPage'
import { useCartStore } from './cartStore'
import type { ProductRecord } from '../../../../shared/product'
import type { SaleRecord } from '../../../../shared/sale'

const coke: ProductRecord = {
  id: '1',
  barcode: '111',
  name: 'Coke',
  priceCents: 2000,
  stock: 5,
  isActive: true,
  createdAt: '',
  updatedAt: ''
}

describe('PosPage', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [] })
    window.api = {
      dbHealth: vi.fn(),
      products: {
        list: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        getByBarcode: vi.fn().mockResolvedValue(coke)
      },
      sales: {
        complete: vi.fn()
      }
    } as unknown as Window['api']
  })

  it('adds a scanned product to the cart and updates the total', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')

    await waitFor(() => expect(screen.getByText('Coke')).toBeInTheDocument())
    expect(screen.getByLabelText('Cart total')).toHaveTextContent('฿20.00')
  })

  it('increments the total when scanning the same barcode twice', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByText('Coke')).toBeInTheDocument())
    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')

    await waitFor(() => expect(screen.getByLabelText('Cart total')).toHaveTextContent('฿40.00'))
  })

  it('shows an alert for an unknown barcode', async () => {
    const user = userEvent.setup()
    ;(window.api.products.getByBarcode as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '999{Enter}')

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Barcode not found: 999')
    )
  })

  it('clears the cart when Clear Cart is clicked', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByText('Coke')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Clear Cart' }))

    expect(screen.getByText('Cart is empty')).toBeInTheDocument()
    expect(screen.getByLabelText('Cart total')).toHaveTextContent('฿0.00')
  })

  it('disables Clear Cart and Finish Sale when the cart is empty', () => {
    render(<PosPage />)
    expect(screen.getByRole('button', { name: 'Clear Cart' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Finish Sale' })).toBeDisabled()
  })

  it("reconciles a cart line's stock on mount, closing the stale-ceiling gap from switching tabs", async () => {
    const user = userEvent.setup()
    const { unmount } = render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByText('Coke')).toBeInTheDocument())
    expect(useCartStore.getState().items[0].stock).toBe(5)

    // Simulate the product's real stock having been edited down elsewhere (e.g. the
    // Products tab) while this cart line still caches the old, higher value.
    ;(window.api.products.getByBarcode as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...coke,
      stock: 1
    })

    // Simulate switching tabs away and back: App.tsx fully unmounts/remounts PosPage.
    unmount()
    render(<PosPage />)

    await waitFor(() => expect(useCartStore.getState().items[0].stock).toBe(1))
    expect(useCartStore.getState().items[0].quantity).toBe(1)
  })

  it('completes the sale, clears the cart, and shows a success message with the total', async () => {
    const user = userEvent.setup()
    const sale: SaleRecord = {
      id: 'sale-1',
      totalCents: 4000,
      status: 'COMPLETED',
      createdAt: '2026-09-03T00:00:00.000Z',
      items: [
        {
          id: 'item-1',
          saleId: 'sale-1',
          productId: '1',
          productName: 'Coke',
          priceCents: 2000,
          quantity: 2,
          totalCents: 4000
        }
      ]
    }
    ;(window.api.sales.complete as ReturnType<typeof vi.fn>).mockResolvedValue(sale)

    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByText('Coke')).toBeInTheDocument())
    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByLabelText('Cart total')).toHaveTextContent('฿40.00'))

    await user.click(screen.getByRole('button', { name: 'Finish Sale' }))

    await waitFor(() => expect(screen.getByText('Cart is empty')).toBeInTheDocument())
    expect(screen.getByRole('status')).toHaveTextContent('฿40.00')
    expect(screen.getByLabelText('Cart total')).toHaveTextContent('฿0.00')
  })

  it('shows an error and keeps the cart when the sale is rejected', async () => {
    const user = userEvent.setup()
    ;(window.api.sales.complete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error(
        'Error invoking remote method \'sales:complete\': InsufficientStockError: Not enough stock for "Coke": 1 available, 2 requested'
      )
    )

    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByText('Coke')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Finish Sale' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Not enough stock for "Coke": 1 available, 2 requested'
      )
    )
    expect(screen.getByText('Coke')).toBeInTheDocument()
  })

  it('hides a previous success message once a new item is scanned into a fresh sale', async () => {
    const user = userEvent.setup()
    const sale: SaleRecord = {
      id: 'sale-1',
      totalCents: 2000,
      status: 'COMPLETED',
      createdAt: '2026-09-03T00:00:00.000Z',
      items: []
    }
    ;(window.api.sales.complete as ReturnType<typeof vi.fn>).mockResolvedValue(sale)

    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByText('Coke')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Finish Sale' }))
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Update the `App.test.tsx` mock shape**

In `src/renderer/src/App.test.tsx`, extend the `beforeEach` mock so its shape matches the real `Window['api']` type:

```typescript
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
      }
    } as unknown as Window['api']
  })
```

- [ ] **Step 3: Run the tests to verify the new ones fail**

Run: `npm test -- PosPage`
Expected: FAIL — no "Finish Sale" button yet, no `role="status"` success element.

- [ ] **Step 4: Add the CSS for the success banner and footer spacing**

In `src/renderer/src/assets/main.css`, add a `gap` to the existing `.pos-footer` rule and a new `.alert-success` rule near `.alert-danger`:

```css
.alert-success {
  background: var(--color-success-soft);
  color: var(--color-success);
  border: 1px solid rgba(46, 125, 50, 0.2);
}
```

Update the existing `.pos-footer` rule to:

```css
.pos-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}
```

- [ ] **Step 5: Implement the `PosPage` changes**

```typescript
// src/renderer/src/features/cart/PosPage.tsx
import { useEffect, useState } from 'react'
import { useCartStore, cartTotalCents } from './cartStore'
import { useBarcodeScan } from './useBarcodeScan'
import { useCompleteSale } from './useCompleteSale'
import CartTable from './CartTable'
import { Money } from '../../../../shared/money'

function PosPage(): React.JSX.Element {
  const items = useCartStore((state) => state.items)
  const incrementItem = useCartStore((state) => state.incrementItem)
  const decrementItem = useCartStore((state) => state.decrementItem)
  const removeItem = useCartStore((state) => state.removeItem)
  const clear = useCartStore((state) => state.clear)
  const { inputRef, value, setValue, error, handleKeyDown } = useBarcodeScan()
  const { completing, error: saleError, completeSale } = useCompleteSale()
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function reconcileStock(): Promise<void> {
      const currentItems = useCartStore.getState().items
      for (const item of currentItems) {
        const fresh = await window.api.products.getByBarcode(item.barcode)
        if (!cancelled && fresh) {
          useCartStore.getState().syncStock(item.productId, fresh.stock)
        }
      }
    }

    reconcileStock()

    return () => {
      cancelled = true
    }
  }, [])

  // A success banner is only meaningful for the sale that just finished. As
  // soon as the cashier starts a new sale (the cart goes from empty back to
  // non-empty), it no longer describes what's on screen — hide it.
  useEffect(() => {
    if (items.length > 0) {
      setSuccessMessage(null)
    }
  }, [items.length])

  async function handleFinishSale(): Promise<void> {
    const sale = await completeSale()
    if (sale) {
      setSuccessMessage(`Sale completed — ${Money.fromCents(sale.totalCents).format()}`)
    }
  }

  return (
    <div className="products-page">
      <div className="products-header">
        <h1>POS</h1>
        <div className="pos-total" aria-label="Cart total">
          {Money.fromCents(cartTotalCents(items)).format()}
        </div>
      </div>

      <div className="scan-field">
        <label htmlFor="barcode-scan">Barcode</label>
        <input
          id="barcode-scan"
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Scan or type a barcode, then press Enter"
          autoComplete="off"
        />
      </div>

      {(error || saleError) && (
        <p role="alert" className="alert alert-danger">
          {error ?? saleError}
        </p>
      )}

      {successMessage && (
        <p role="status" className="alert alert-success">
          {successMessage}
        </p>
      )}

      <div className="products-card">
        <CartTable
          items={items}
          onIncrement={incrementItem}
          onDecrement={decrementItem}
          onRemove={removeItem}
        />
      </div>

      <div className="pos-footer">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={clear}
          disabled={items.length === 0 || completing}
        >
          Clear Cart
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleFinishSale}
          disabled={items.length === 0 || completing}
        >
          {completing ? 'Completing…' : 'Finish Sale'}
        </button>
      </div>
    </div>
  )
}

export default PosPage
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- PosPage App`
Expected: PASS, all `PosPage` and `App` tests green.

- [ ] **Step 7: Run the full suite and lint**

Run: `npm test && npm run lint && npm run typecheck` (confirm exact script names in `package.json` first)
Expected: PASS with no new warnings/errors.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/features/cart/PosPage.tsx src/renderer/src/features/cart/PosPage.test.tsx src/renderer/src/App.test.tsx src/renderer/src/assets/main.css
git commit -m "feat: add Finish Sale button and success banner to POS screen"
```

---

## Definition of Done

- `npm test` passes in full (existing 91 tests + all new tests from this plan).
- `npm run lint` and `npm run typecheck` (or their actual `package.json` equivalents) pass with no new issues.
- A cashier can: scan one or more products into the cart, click "Finish Sale," see the cart clear and a success message showing the sale total, and see `products.stock` reduced by the sold quantities.
- Attempting to sell more than the current DB stock (even if the client's cached cart thought it was fine) is rejected with a clear error, the cart is left untouched, and no `sales`/`sale_items`/`stock_transactions` rows are written.
- Every write path (`sale-repository.ts`) is covered by a test that forces a mid-transaction failure and asserts nothing was committed — not just that the happy path works.

## What this phase doesn't cover

- **Dashboard / Sales history** (Phase 5): no UI reads `sales`/`sale_items` back yet; this phase only writes them.
- **Automatic stock re-sync after a rejected Finish Sale**: if `completeSale` is rejected for insufficient stock, the cart is left as-is and its cached `stock` is *not* automatically refreshed from the DB (unlike the existing on-mount reconciliation from Phase 3). The cashier can retry, switch tabs and back (which does reconcile), or remove/adjust the offending line manually. Given this is a single-device app, the practical window for this to matter is small — see the "Design decision" note above.
- **Receipt printing** — explicitly deferred in the spec itself (§10.2, marked P1, "separate the Printer Service from the POS UI" — not part of MVP Phase 4).
- **Manual stock adjustment UI** (spec §7.2 "ปรับ Stock แบบ manual พร้อมบันทึกเหตุผล (optional ใน MVP)") — out of scope; `stock_transactions` rows are only written by `completeSale` in this phase.
- **Sale cancellation/void** — spec §6.4 explicitly puts this out of MVP scope ("ใช้ status/cancel ภายหลัง").
