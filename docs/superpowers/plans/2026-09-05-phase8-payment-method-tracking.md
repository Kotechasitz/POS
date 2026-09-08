# Phase 8: Payment Method Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record which payment method (Cash / QR / Card) the cashier used for each sale, and add the `discountCents` column `completeSale()` will need once Phase 9 wires up an actual discount input — per `docs/superpowers/specs/2026-09-05-pos-enhancements-design.md`.

**Architecture:** Two new columns on `sales` (`payment_method`, `discount_cents`). `completeSale()` gains two new parameters, threaded through the IPC boundary exactly like every other repository/handler/preload triple in this codebase. On the renderer side, clicking "Finish Sale" now opens a small modal (matching the existing `ProductForm`/`CategoryManager` modal convention) asking the cashier to pick Cash / QR / Card before the sale actually commits — this is a UI step only, not a payment integration: no QR is generated, no card terminal is contacted. This phase does **not** add a discount input field (that's Phase 9); `discountCents` is always sent as `0` from the renderer until then, but the backend fully supports and validates a nonzero value already.

**Tech Stack:** Same as the rest of the app — Electron main process, Drizzle ORM/better-sqlite3, React 19 renderer, Vitest + React Testing Library. No new dependencies.

## Global Constraints

- Every write path gets a test in the same task; assert real outcomes against a real SQLite DB or real rendered DOM — no "it didn't throw" tests.
- The renderer never imports `better-sqlite3`/`drizzle-orm`/`electron`, or anything under `src/main/**` — everything crosses `window.api`.
- `src/shared/**` must not import from `src/main/**`.
- Domain errors are named classes extending `Error` with a `.name` override (matching `SaleValidationError`, `EmptyCartError`, etc. in `sale-repository.ts`) — never a bare `throw new Error(...)` for an expected validation/business-rule failure.
- Money is always an integer number of satang through the `Money` class — never raw `+`/`-`/`*` on a `cents` number.
- `completeSale()`'s total is `subtotal - discountCents`. A discount larger than the subtotal is rejected outright (`SaleValidationError`), never clamped to zero.
- Payment method is purely a record of what the cashier observed — this phase never contacts a card terminal or generates a QR code.

## File Structure

- Modify: `src/main/database/schema.ts` — `sales` gains `paymentMethod`, `discountCents`.
- Create (generated): a new `drizzle/*.sql` migration.
- Modify: `src/shared/sale.ts` — new `PaymentMethod` type; `SaleRecord` gains `paymentMethod`/`discountCents`.
- Modify: `src/shared/money.ts` (+ test) — new `Money.subtract()`.
- Modify: `src/main/database/repositories/sale-repository.ts` (+ test) — `completeSale()` gains `paymentMethod`/`discountCents` parameters, validation, and the discount-adjusted total.
- Modify: `src/main/ipc/register-sale-handlers.ts` (+ test), `src/preload/index.ts`, `src/preload/index.d.ts` — thread the two new arguments through.
- Create: `src/renderer/src/features/cart/PaymentMethodModal.tsx` (+ test) — the Cash/QR/Card picker shown before a sale commits.
- Modify: `src/renderer/src/features/cart/useCompleteSale.ts` (+ test) — `completeSale` takes a `paymentMethod` argument, always sends `discountCents: 0`.
- Modify: `src/renderer/src/features/cart/PosPage.tsx` (+ test) — "Finish Sale" opens the modal instead of completing immediately.
- Modify: `src/renderer/src/assets/main.css` — payment-method-picker styles.

---

### Task 1: Schema, migration, and shared types

**Files:**
- Modify: `src/main/database/schema.ts`
- Create (generated): a new `drizzle/*.sql` migration
- Modify: `src/shared/sale.ts`
- Modify: `src/shared/money.ts`
- Test: `src/shared/money.test.ts`

**Interfaces:**
- Produces: `sales.paymentMethod`/`sales.discountCents` columns; `src/shared/sale.ts`'s `export type PaymentMethod = 'CASH' | 'QR' | 'CARD'` and extended `SaleRecord { ...; paymentMethod: PaymentMethod; discountCents: number }`; `Money.prototype.subtract(other: Money): Money` — every later task in this plan imports these exact shapes.

- [ ] **Step 1: Add the two new columns to `sales` in `schema.ts`**

Change the existing `sales` table definition from:

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

to:

```typescript
export const sales = sqliteTable(
  'sales',
  {
    id: text('id').primaryKey(),
    totalCents: integer('total_cents').notNull(),
    status: text('status').notNull().default('COMPLETED'),
    // Default 'CASH' exists ONLY so SQLite can backfill any pre-Phase-8 sales
    // rows on an existing shop's database — completeSale() (Task 2) always
    // passes an explicit, validated paymentMethod on every new insert, so
    // application code never actually relies on this default.
    paymentMethod: text('payment_method').notNull().default('CASH'),
    discountCents: integer('discount_cents').notNull().default(0),
    createdAt: text('created_at').notNull()
  },
  (table) => ({
    createdAtIdx: index('sales_created_at_idx').on(table.createdAt)
  })
)
```

- [ ] **Step 2: Generate and verify the migration**

Run: `npm run db:generate`
Expected: a new file appears under `drizzle/` (e.g. `0003_<generated-name>.sql`). Open it and confirm it contains exactly two `ALTER TABLE sales ADD COLUMN payment_method text DEFAULT 'CASH' NOT NULL` / `ALTER TABLE sales ADD COLUMN discount_cents integer DEFAULT 0 NOT NULL` statements (or an equivalent table-rebuild SQLite uses for adding NOT NULL columns — drizzle-kit may choose either strategy). If it contains anything else, or touches any other table, stop and report rather than committing an unexpected migration.

- [ ] **Step 3: Add `PaymentMethod` and extend `SaleRecord` in `src/shared/sale.ts`**

Change:

```typescript
export interface SaleRecord {
  id: string
  totalCents: number
  status: string
  createdAt: string
  items: SaleItemRecord[]
}
```

to:

```typescript
export type PaymentMethod = 'CASH' | 'QR' | 'CARD'

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

(`SaleLineInput`/`SaleItemRecord` are per-line and unaffected — leave them exactly as they are.)

- [ ] **Step 4: Write the failing test for `Money.subtract`**

Add to `src/shared/money.test.ts`, inside the existing `describe('Money', ...)` block (after the `'adds two amounts without floating-point drift'` test):

```typescript
  it('subtracts one amount from another', () => {
    const total = Money.fromBaht(40)
    const discount = Money.fromBaht(5)
    expect(total.subtract(discount).cents).toBe(3500)
  })

  it('rejects a subtraction that would go negative', () => {
    const total = Money.fromBaht(10)
    const discount = Money.fromBaht(15)
    expect(() => total.subtract(discount)).toThrow('cannot be negative')
  })
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run src/shared/money.test.ts`
Expected: FAIL — `Money.prototype.subtract` doesn't exist yet.

- [ ] **Step 6: Implement `Money.subtract`**

Add to `src/shared/money.ts`, right after the existing `add` method:

```typescript
  subtract(other: Money): Money {
    return Money.fromCents(this._cents - other._cents)
  }
```

(`Money.fromCents` already throws `"Money cannot be negative"` for a negative result — no separate guard needed here, matching how `multiply` already leans on `fromCents`'s own validation.)

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/shared/money.test.ts`
Expected: PASS (all `Money` tests, including the two new ones).

- [ ] **Step 8: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: FAIL at typecheck — `sale-repository.ts` builds a `SaleRecord` object literal that's now missing `paymentMethod`/`discountCents`. This is expected; Task 2 resolves it. Confirm the failure is exactly this (missing fields on the `SaleRecord` literals in `sale-repository.ts`), not something else, then proceed.

- [ ] **Step 9: Commit**

```bash
git add src/main/database/schema.ts drizzle/ src/shared/sale.ts src/shared/money.ts src/shared/money.test.ts
git commit -m "feat: add payment method and discount columns; Money.subtract"
```

---

### Task 2: `completeSale()` — payment method, discount, and the adjusted total

**Files:**
- Modify: `src/main/database/repositories/sale-repository.ts`
- Test: `src/main/database/repositories/sale-repository.test.ts`
- Modify: `src/main/database/repositories/sales-history-repository.ts` — `getSaleWithItems` also builds a `SaleRecord` literal and needs the two new fields.
- Modify (mechanical call-site fix only, no logic changes): every file that calls `completeSale(client.db, [...])` purely to seed data for an unrelated feature's tests — `completeSale`'s new required third parameter breaks all of them the moment this task lands:
  - `src/main/database/repositories/sales-history-repository.test.ts` (5 call sites, plus its own `getSaleWithItems` assertions gain the two new fields)
  - `src/main/database/repositories/dashboard-repository.test.ts` (9 call sites)
  - `src/main/ipc/register-sales-history-handlers.test.ts` (2 call sites)
  - `src/main/ipc/register-dashboard-handlers.test.ts` (3 call sites)
- Modify (fixture fields only, no logic changes): `src/renderer/src/features/sales-history/SaleDetailModal.test.tsx`, `src/renderer/src/features/sales-history/SalesHistoryPage.test.tsx` — each declares a `SaleRecord`-typed fixture the extended interface now makes incomplete.

**Interfaces:**
- Consumes: `PaymentMethod` from `../../../shared/sale` (Task 1); `Money.prototype.subtract` (Task 1).
- Produces: `completeSale(db, items: SaleLineInput[], paymentMethod: PaymentMethod, discountCents?: number): SaleRecord` (new signature — `discountCents` defaults to `0`); `class SaleValidationError` gains two new reachable messages (invalid payment method, discount exceeding subtotal) but keeps its existing name/shape — for Task 3 (IPC) to import the updated `completeSale` signature and Task 4 (frontend) to know what to send.

- [ ] **Step 1: Write the failing tests**

Add to `src/main/database/repositories/sale-repository.test.ts`. First, update every existing `completeSale(client.db, [...])` call in this file to `completeSale(client.db, [...], 'CASH')` (the tests don't care about payment method, so `'CASH'` everywhere is fine) — this file has many call sites; update all of them, including inside the two `expect(() => completeSale(...)).toThrow(...)` assertions. Then add these new tests at the end of the `describe('completeSale', ...)` block:

```typescript
  it('records the payment method on the sale', () => {
    const water = createProduct(client.db, {
      barcode: '222',
      name: 'Water',
      priceCents: 1000,
      stock: 5
    })
    const line: SaleLineInput = {
      productId: water.id,
      productName: water.name,
      unitPriceCents: water.priceCents,
      quantity: 1
    }

    const sale = completeSale(client.db, [line], 'QR')

    expect(sale.paymentMethod).toBe('QR')
    const saved = client.db.select().from(sales).where(eq(sales.id, sale.id)).get()
    expect(saved?.paymentMethod).toBe('QR')
  })

  it('rejects an invalid payment method without writing anything', () => {
    const water = createProduct(client.db, {
      barcode: '222',
      name: 'Water',
      priceCents: 1000,
      stock: 5
    })
    const line: SaleLineInput = {
      productId: water.id,
      productName: water.name,
      unitPriceCents: water.priceCents,
      quantity: 1
    }

    expect(() =>
      completeSale(client.db, [line], 'BITCOIN' as unknown as PaymentMethod)
    ).toThrow(SaleValidationError)
    expect(client.db.select().from(sales).all()).toHaveLength(0)
  })

  it('defaults discountCents to 0 when omitted', () => {
    const water = createProduct(client.db, {
      barcode: '222',
      name: 'Water',
      priceCents: 1000,
      stock: 1
    })
    const line: SaleLineInput = {
      productId: water.id,
      productName: water.name,
      unitPriceCents: water.priceCents,
      quantity: 1
    }

    const sale = completeSale(client.db, [line], 'CASH')

    expect(sale.discountCents).toBe(0)
    expect(sale.totalCents).toBe(1000)
  })

  it('subtracts the discount from the subtotal to produce the total', () => {
    const water = createProduct(client.db, {
      barcode: '222',
      name: 'Water',
      priceCents: 1000,
      stock: 3
    })
    const line: SaleLineInput = {
      productId: water.id,
      productName: water.name,
      unitPriceCents: water.priceCents,
      quantity: 3
    }

    const sale = completeSale(client.db, [line], 'CARD', 500)

    expect(sale.discountCents).toBe(500)
    expect(sale.totalCents).toBe(2500)
    const saved = client.db.select().from(sales).where(eq(sales.id, sale.id)).get()
    expect(saved?.discountCents).toBe(500)
    expect(saved?.totalCents).toBe(2500)
  })

  it('allows a discount exactly equal to the subtotal, producing a total of zero', () => {
    const water = createProduct(client.db, {
      barcode: '222',
      name: 'Water',
      priceCents: 1000,
      stock: 1
    })
    const line: SaleLineInput = {
      productId: water.id,
      productName: water.name,
      unitPriceCents: water.priceCents,
      quantity: 1
    }

    const sale = completeSale(client.db, [line], 'CASH', 1000)

    expect(sale.totalCents).toBe(0)
  })

  it('rejects a discount one satang over the subtotal, rolling back the entire sale', () => {
    const water = createProduct(client.db, {
      barcode: '222',
      name: 'Water',
      priceCents: 1000,
      stock: 1
    })
    const line: SaleLineInput = {
      productId: water.id,
      productName: water.name,
      unitPriceCents: water.priceCents,
      quantity: 1
    }

    expect(() => completeSale(client.db, [line], 'CASH', 1001)).toThrow(SaleValidationError)

    expect(client.db.select().from(sales).all()).toHaveLength(0)
    expect(client.db.select().from(saleItems).all()).toHaveLength(0)
    expect(client.db.select().from(stockTransactions).all()).toHaveLength(0)
    const after = client.db.select().from(products).where(eq(products.id, water.id)).get()
    expect(after?.stock).toBe(1)
  })

  it('rejects a negative discount', () => {
    const water = createProduct(client.db, {
      barcode: '222',
      name: 'Water',
      priceCents: 1000,
      stock: 5
    })
    const line: SaleLineInput = {
      productId: water.id,
      productName: water.name,
      unitPriceCents: water.priceCents,
      quantity: 1
    }

    expect(() => completeSale(client.db, [line], 'CASH', -100)).toThrow(SaleValidationError)
  })

  it('rejects a non-integer discount', () => {
    const water = createProduct(client.db, {
      barcode: '222',
      name: 'Water',
      priceCents: 1000,
      stock: 5
    })
    const line: SaleLineInput = {
      productId: water.id,
      productName: water.name,
      unitPriceCents: water.priceCents,
      quantity: 1
    }

    expect(() => completeSale(client.db, [line], 'CASH', 10.5)).toThrow(SaleValidationError)
  })
```

Add `import type { SaleLineInput, PaymentMethod } from '../../../shared/sale'` (replacing the existing `SaleLineInput`-only import) at the top of the test file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/main/database/repositories/sale-repository.test.ts`
Expected: FAIL — `completeSale` doesn't accept a `paymentMethod` argument yet, and every updated call site is a type error at the call sites you just edited (or a runtime mismatch if TS isn't checked by vitest — either way, the new assertions fail).

- [ ] **Step 3: Implement the new parameters, validation, and total calculation**

In `src/main/database/repositories/sale-repository.ts`, change the import line:

```typescript
import type { SaleLineInput, SaleItemRecord, SaleRecord } from '../../../shared/sale'
```

to:

```typescript
import type { SaleLineInput, SaleItemRecord, SaleRecord, PaymentMethod } from '../../../shared/sale'
```

Add two new validation functions right after the existing `validateLine`:

```typescript
function validatePaymentMethod(paymentMethod: PaymentMethod): void {
  if (paymentMethod !== 'CASH' && paymentMethod !== 'QR' && paymentMethod !== 'CARD') {
    throw new SaleValidationError(`Invalid payment method: ${String(paymentMethod)}`)
  }
}

function validateDiscountCents(discountCents: number): void {
  if (!Number.isInteger(discountCents) || discountCents < 0) {
    throw new SaleValidationError(
      `Discount must be a non-negative integer number of satang, got ${discountCents}`
    )
  }
}
```

Change the `completeSale` signature and body from:

```typescript
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
      if (!product.isActive) {
        throw new ProductNotAvailableError(product.name)
      }
      if (product.stock < line.quantity) {
        throw new InsufficientStockError(product.name, product.stock, line.quantity)
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

    return {
      id: saleId,
      totalCents: total.cents,
      status: 'COMPLETED',
      createdAt: now,
      items: itemRecords
    }
  })
}
```

to:

```typescript
export function completeSale(
  db: BetterSQLite3Database,
  items: SaleLineInput[],
  paymentMethod: PaymentMethod,
  discountCents: number = 0
): SaleRecord {
  if (items.length === 0) {
    throw new EmptyCartError()
  }
  items.forEach(validateLine)
  validatePaymentMethod(paymentMethod)
  validateDiscountCents(discountCents)

  // better-sqlite3 transactions are synchronous: this whole callback runs
  // inside one BEGIN/COMMIT, and throwing anywhere in it rolls everything
  // back, including writes made earlier in the same callback (spec §6.3 /
  // §11: never create a Sale successfully while failing to cut stock, and
  // never leave stock half-changed after a mid-transaction failure). The
  // discount-exceeds-subtotal check below relies on this: it can only run
  // once every line's stock has already been (tentatively) deducted inside
  // this same transaction, and throwing there rolls all of that back too —
  // the same mechanism InsufficientStockError already relies on.
  return db.transaction((tx) => {
    const now = new Date().toISOString()
    const saleId = randomUUID()
    let subtotal = Money.fromCents(0)

    const itemRecords: SaleItemRecord[] = items.map((line) => {
      const product = tx.select().from(products).where(eq(products.id, line.productId)).get()
      if (!product) {
        throw new ProductNotFoundError(line.productId)
      }
      if (!product.isActive) {
        throw new ProductNotAvailableError(product.name)
      }
      if (product.stock < line.quantity) {
        throw new InsufficientStockError(product.name, product.stock, line.quantity)
      }

      // Global Constraints: money math always goes through Money, never raw
      // +/* on cents.
      const lineTotal = Money.fromCents(line.unitPriceCents).multiply(line.quantity)
      const lineTotalCents = lineTotal.cents
      subtotal = subtotal.add(lineTotal)

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

    if (discountCents > subtotal.cents) {
      throw new SaleValidationError(
        `Discount (${discountCents}) cannot exceed the subtotal (${subtotal.cents})`
      )
    }
    const total = subtotal.subtract(Money.fromCents(discountCents))

    tx.insert(sales)
      .values({
        id: saleId,
        totalCents: total.cents,
        status: 'COMPLETED',
        paymentMethod,
        discountCents,
        createdAt: now
      })
      .run()

    itemRecords.forEach((item) => {
      tx.insert(saleItems).values(item).run()
    })

    return {
      id: saleId,
      totalCents: total.cents,
      status: 'COMPLETED',
      paymentMethod,
      discountCents,
      createdAt: now,
      items: itemRecords
    }
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/main/database/repositories/sale-repository.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Fix every other call site `completeSale`'s new signature breaks**

`getSaleWithItems` in `src/main/database/repositories/sales-history-repository.ts` also builds a `SaleRecord` literal. Change:

```typescript
  return {
    id: sale.id,
    totalCents: sale.totalCents,
    status: sale.status,
    createdAt: sale.createdAt,
    items
  }
```

to:

```typescript
  return {
    id: sale.id,
    totalCents: sale.totalCents,
    status: sale.status,
    paymentMethod: sale.paymentMethod as PaymentMethod,
    discountCents: sale.discountCents,
    createdAt: sale.createdAt,
    items
  }
```

Add `PaymentMethod` to that file's existing import: change `import type { SaleRecord } from '../../../shared/sale'` to `import type { SaleRecord, PaymentMethod } from '../../../shared/sale'`. (`sale.paymentMethod` comes back from Drizzle typed as a plain `string` — this codebase has no `SaleRow`/`SaleRecord` compile-time drift guard for the `sales` table the way it does for `products`, so a type assertion here is the same kind of trusted narrowing `sale.status` already implicitly relies on.)

Then, in each of these four test files, every `completeSale(client.db, [...])` call is seeding data for a feature unrelated to payment method — add `'CASH'` as a third argument to every one of them, changing `completeSale(client.db, [<items>])` to `completeSale(client.db, [<items>], 'CASH')` (including calls whose `[<items>]` array spans multiple lines — add `, 'CASH'` after the array's closing `]`, before the call's closing `)`):
- `src/main/database/repositories/sales-history-repository.test.ts` (5 call sites)
- `src/main/database/repositories/dashboard-repository.test.ts` (9 call sites)
- `src/main/ipc/register-sales-history-handlers.test.ts` (2 call sites)
- `src/main/ipc/register-dashboard-handlers.test.ts` (3 call sites)

In `src/main/database/repositories/sales-history-repository.test.ts`'s `'returns the full sale record with its line items'` test (inside `describe('getSaleWithItems', ...)`), add two assertions right after the existing `expect(detail?.status).toBe('COMPLETED')` line:

```typescript
    expect(detail?.paymentMethod).toBe('CASH')
    expect(detail?.discountCents).toBe(0)
```

Two renderer test files also declare a `const ...: SaleRecord = {...}` fixture that the extended interface now makes incomplete — add `paymentMethod: 'CASH',` and `discountCents: 0,` (right after each fixture's existing `status: 'COMPLETED',` line):
- `src/renderer/src/features/sales-history/SaleDetailModal.test.tsx` (the `sale` fixture)
- `src/renderer/src/features/sales-history/SalesHistoryPage.test.tsx` (the `detail` fixture)

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: FAIL at typecheck — `register-sale-handlers.ts` still calls `completeSale(db, items)` with only two arguments. This is expected; Task 3 resolves it. Every other typecheck/test failure must now be gone — if `npm test` fails anywhere other than that one known `register-sale-handlers.ts` typecheck error, stop and investigate before proceeding.

- [ ] **Step 7: Commit**

```bash
git add src/main/database/repositories/sale-repository.ts src/main/database/repositories/sale-repository.test.ts src/main/database/repositories/sales-history-repository.ts src/main/database/repositories/sales-history-repository.test.ts src/main/database/repositories/dashboard-repository.test.ts src/main/ipc/register-sales-history-handlers.test.ts src/main/ipc/register-dashboard-handlers.test.ts src/renderer/src/features/sales-history/SaleDetailModal.test.tsx src/renderer/src/features/sales-history/SalesHistoryPage.test.tsx
git commit -m "feat: thread payment method and discount through completeSale"
```

---

### Task 3: IPC handler and preload

**Files:**
- Modify: `src/main/ipc/register-sale-handlers.ts`
- Test: `src/main/ipc/register-sale-handlers.test.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

**Interfaces:**
- Consumes: `completeSale(db, items, paymentMethod, discountCents?)` from `../database/repositories/sale-repository` (Task 2); `PaymentMethod` from `../../shared/sale`.
- Produces: `window.api.sales.complete(items: SaleLineInput[], paymentMethod: PaymentMethod, discountCents: number): Promise<SaleRecord>` — Task 4 (frontend) calls this exact signature.

- [ ] **Step 1: Write the failing tests**

In `src/main/ipc/register-sale-handlers.test.ts`, update the two existing `completeHandler({}, [line])` calls to `completeHandler({}, [line], 'CASH', 0)`, and add this test at the end of the `describe` block:

```typescript
  it('sales:complete records the payment method and applies the discount', () => {
    const water = createProduct(client.db, {
      barcode: '222',
      name: 'Water',
      priceCents: 1000,
      stock: 5
    })
    const completeHandler = handlers.get('sales:complete')!

    const line: SaleLineInput = {
      productId: water.id,
      productName: water.name,
      unitPriceCents: water.priceCents,
      quantity: 2
    }
    const sale = completeHandler({}, [line], 'QR', 500) as SaleRecord

    expect(sale.paymentMethod).toBe('QR')
    expect(sale.discountCents).toBe(500)
    expect(sale.totalCents).toBe(1500)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/main/ipc/register-sale-handlers.test.ts`
Expected: FAIL — the handler only forwards `items` today, ignoring any further arguments, so `completeSale` (Task 2) throws because `paymentMethod` is `undefined`.

- [ ] **Step 3: Update the handler**

Change `src/main/ipc/register-sale-handlers.ts` from:

```typescript
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

to:

```typescript
import { ipcMain } from 'electron'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { completeSale } from '../database/repositories/sale-repository'
import type { SaleLineInput, SaleRecord, PaymentMethod } from '../../shared/sale'

export function registerSaleHandlers(db: BetterSQLite3Database): void {
  ipcMain.handle(
    'sales:complete',
    (
      _event,
      items: SaleLineInput[],
      paymentMethod: PaymentMethod,
      discountCents: number
    ): SaleRecord => {
      return completeSale(db, items, paymentMethod, discountCents)
    }
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/main/ipc/register-sale-handlers.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the preload bridge**

In `src/preload/index.ts`, change:

```typescript
import type { SaleLineInput, SaleRecord } from '../shared/sale'
```

to:

```typescript
import type { SaleLineInput, SaleRecord, PaymentMethod } from '../shared/sale'
```

and change:

```typescript
  sales: {
    complete: (items: SaleLineInput[]): Promise<SaleRecord> =>
      ipcRenderer.invoke('sales:complete', items)
  },
```

to:

```typescript
  sales: {
    complete: (
      items: SaleLineInput[],
      paymentMethod: PaymentMethod,
      discountCents: number
    ): Promise<SaleRecord> => ipcRenderer.invoke('sales:complete', items, paymentMethod, discountCents)
  },
```

In `src/preload/index.d.ts`, apply the identical two changes (same import line, same `sales.complete` signature change) so `window.api.sales.complete`'s type matches what Task 4 will call.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: FAIL at typecheck — `useCompleteSale.ts` still calls `window.api.sales.complete(lines)` with one argument. This is expected; Task 4 resolves it.

- [ ] **Step 7: Commit**

```bash
git add src/main/ipc/register-sale-handlers.ts src/main/ipc/register-sale-handlers.test.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat: expose payment method and discount over sales:complete IPC"
```

---

### Task 4: Payment method modal and POS checkout flow

**Files:**
- Create: `src/renderer/src/features/cart/PaymentMethodModal.tsx`
- Test: `src/renderer/src/features/cart/PaymentMethodModal.test.tsx`
- Modify: `src/renderer/src/features/cart/useCompleteSale.ts`
- Test: `src/renderer/src/features/cart/useCompleteSale.test.ts`
- Modify: `src/renderer/src/features/cart/PosPage.tsx`
- Test: `src/renderer/src/features/cart/PosPage.test.tsx`
- Modify: `src/renderer/src/assets/main.css`

**Interfaces:**
- Consumes: `window.api.sales.complete(items, paymentMethod, discountCents)` (Task 3); `PaymentMethod` from `../../../../shared/sale`.
- Produces: `PaymentMethodModal` component with props `{ submitting: boolean; onSelect: (method: PaymentMethod) => void; onCancel: () => void }`; `useCompleteSale()`'s `completeSale` now takes `(paymentMethod: PaymentMethod) => Promise<SaleRecord | null>` instead of taking no arguments.

- [ ] **Step 1: Write the failing test for `PaymentMethodModal`**

```typescript
// src/renderer/src/features/cart/PaymentMethodModal.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PaymentMethodModal from './PaymentMethodModal'

describe('PaymentMethodModal', () => {
  it('renders a button for each payment method', () => {
    render(<PaymentMethodModal submitting={false} onSelect={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Cash' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'QR' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Card' })).toBeInTheDocument()
  })

  it('calls onSelect with the chosen method', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<PaymentMethodModal submitting={false} onSelect={onSelect} onCancel={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'QR' }))

    expect(onSelect).toHaveBeenCalledWith('QR')
  })

  it('calls onCancel when the Cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<PaymentMethodModal submitting={false} onSelect={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<PaymentMethodModal submitting={false} onSelect={vi.fn()} onCancel={onCancel} />)

    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('disables every button and ignores Escape while submitting', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<PaymentMethodModal submitting={true} onSelect={vi.fn()} onCancel={onCancel} />)

    expect(screen.getByRole('button', { name: 'Cash' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'QR' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Card' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()

    await user.keyboard('{Escape}')
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('does not call onCancel when clicking inside the dialog panel', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<PaymentMethodModal submitting={false} onSelect={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole('dialog'))

    expect(onCancel).not.toHaveBeenCalled()
  })

  it('calls onCancel when the backdrop is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<PaymentMethodModal submitting={false} onSelect={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole('dialog').parentElement as HTMLElement)

    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/features/cart/PaymentMethodModal.test.tsx`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement `PaymentMethodModal`**

```typescript
// src/renderer/src/features/cart/PaymentMethodModal.tsx
import { useEffect } from 'react'
import type { PaymentMethod } from '../../../../shared/sale'

export interface PaymentMethodModalProps {
  submitting: boolean
  onSelect: (method: PaymentMethod) => void
  onCancel: () => void
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'QR', label: 'QR' },
  { value: 'CARD', label: 'Card' }
]

function PaymentMethodModal({
  submitting,
  onSelect,
  onCancel
}: PaymentMethodModalProps): React.JSX.Element {
  // Same Escape-to-close convention as ProductForm/CategoryManager, guarded
  // against an in-flight sale so an accidental keypress can't abandon a
  // completeSale() call that's already been sent.
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

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-method-title"
      >
        <h2 id="payment-method-title">Select Payment Method</h2>
        <div className="payment-method-options">
          {PAYMENT_METHODS.map((method) => (
            <button
              key={method.value}
              type="button"
              className="btn btn-primary payment-method-btn"
              onClick={() => onSelect(method.value)}
              disabled={submitting}
            >
              {method.label}
            </button>
          ))}
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
        </div>
      </div>
    </div>
  )
}

export default PaymentMethodModal
```

Add to `src/renderer/src/assets/main.css` (anywhere near the other `.modal-*` rules, e.g. right after `.modal-actions`):

```css
.payment-method-options {
  display: flex;
  gap: var(--space-3);
}

.payment-method-btn {
  flex: 1;
  padding: var(--space-4) var(--space-3);
  font-size: 15px;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/features/cart/PaymentMethodModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Update `useCompleteSale` to take a payment method**

Write the failing test first — change `src/renderer/src/features/cart/useCompleteSale.test.ts`'s first test (`'maps the cart to sale lines, completes the sale, and clears the cart'`) so the call becomes `await result.current.completeSale('CASH')` and the assertion becomes:

```typescript
    expect(window.api.sales.complete).toHaveBeenCalledWith(
      [{ productId: '1', productName: 'Coke', unitPriceCents: 2000, quantity: 2 }],
      'CASH',
      0
    )
```

Update every other `result.current.completeSale()` call in this file (the empty-cart test, the error test, the in-flight test, the clearError test) to `result.current.completeSale('CASH')` — the specific method doesn't matter for those, but the function now requires an argument.

Run: `npx vitest run src/renderer/src/features/cart/useCompleteSale.test.ts` — expect FAIL (wrong arity / wrong `toHaveBeenCalledWith` shape).

Then change `src/renderer/src/features/cart/useCompleteSale.ts` from:

```typescript
import { useCallback, useState } from 'react'
import { useCartStore } from './cartStore'
import type { SaleLineInput, SaleRecord } from '../../../../shared/sale'
import { toUserMessage } from '../../lib/ipcError'

export interface UseCompleteSaleResult {
  completing: boolean
  error: string | null
  completeSale: () => Promise<SaleRecord | null>
  clearError: () => void
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

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return { completing, error, completeSale, clearError }
}
```

to:

```typescript
import { useCallback, useState } from 'react'
import { useCartStore } from './cartStore'
import type { SaleLineInput, SaleRecord, PaymentMethod } from '../../../../shared/sale'
import { toUserMessage } from '../../lib/ipcError'

export interface UseCompleteSaleResult {
  completing: boolean
  error: string | null
  completeSale: (paymentMethod: PaymentMethod) => Promise<SaleRecord | null>
  clearError: () => void
}

export function useCompleteSale(): UseCompleteSaleResult {
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const completeSale = useCallback(
    async (paymentMethod: PaymentMethod): Promise<SaleRecord | null> => {
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
        // discountCents is always 0 here — Phase 9 adds the actual discount
        // input and threads a real value through this same call.
        const sale = await window.api.sales.complete(lines, paymentMethod, 0)
        useCartStore.getState().clear()
        return sale
      } catch (err) {
        setError(toUserMessage(err))
        return null
      } finally {
        setCompleting(false)
      }
    },
    []
  )

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return { completing, error, completeSale, clearError }
}
```

Run: `npx vitest run src/renderer/src/features/cart/useCompleteSale.test.ts` — expect PASS.

- [ ] **Step 6: Wire the modal into `PosPage`**

Write the failing test first — in `src/renderer/src/features/cart/PosPage.test.tsx`, `sales: { complete: vi.fn() }` stays the same in the `beforeEach` mock, but every test that clicks `'Finish Sale'` and expects the sale to complete immediately must be updated to also pick a payment method afterward. Note: Task 2 already added `paymentMethod: 'CASH',`/`discountCents: 0,` to this file's two `SaleRecord` fixtures (a typecheck-driven fixture fix, unrelated to this task) — the "Replace" blocks below already reflect that current file content. Replace the four affected tests:

Replace:

```typescript
  it('completes the sale, clears the cart, and shows a success message with the total', async () => {
    const user = userEvent.setup()
    const sale: SaleRecord = {
      id: 'sale-1',
      totalCents: 4000,
      status: 'COMPLETED',
      paymentMethod: 'CASH',
      discountCents: 0,
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
```

with:

```typescript
  it('opens the payment method modal, then completes the sale, clears the cart, and shows a success message', async () => {
    const user = userEvent.setup()
    const sale: SaleRecord = {
      id: 'sale-1',
      totalCents: 4000,
      status: 'COMPLETED',
      paymentMethod: 'CASH',
      discountCents: 0,
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
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Cash' }))

    expect(window.api.sales.complete).toHaveBeenCalledWith(
      [{ productId: '1', productName: 'Coke', unitPriceCents: 2000, quantity: 2 }],
      'CASH',
      0
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Cart is empty')).toBeInTheDocument())
    expect(screen.getByRole('status')).toHaveTextContent('฿40.00')
    expect(screen.getByLabelText('Cart total')).toHaveTextContent('฿0.00')
  })

  it('closes the payment method modal without completing the sale when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByText('Coke')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Finish Sale' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.api.sales.complete).not.toHaveBeenCalled()
    expect(screen.getByText('Coke')).toBeInTheDocument()
  })
```

Now replace the two remaining tests that click Finish Sale expecting an immediate result:

Replace:

```typescript
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

  it('clears a stale sale-rejection banner once a new item is scanned', async () => {
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

    // Scan a new, valid item — the stale sale-rejection banner must not linger
    // over this fresh cart state.
    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')

    await waitFor(() =>
      expect(
        screen.queryByText('Not enough stock for "Coke": 1 available, 2 requested')
      ).not.toBeInTheDocument()
    )
  })
```

with:

```typescript
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
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Cash' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Not enough stock for "Coke": 1 available, 2 requested'
      )
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Coke')).toBeInTheDocument()
  })

  it('clears a stale sale-rejection banner once a new item is scanned', async () => {
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
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Cash' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Not enough stock for "Coke": 1 available, 2 requested'
      )
    )

    // Scan a new, valid item — the stale sale-rejection banner must not linger
    // over this fresh cart state.
    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')

    await waitFor(() =>
      expect(
        screen.queryByText('Not enough stock for "Coke": 1 available, 2 requested')
      ).not.toBeInTheDocument()
    )
  })
```

And finally replace:

```typescript
  it('hides a previous success message once a new item is scanned into a fresh sale', async () => {
    const user = userEvent.setup()
    const sale: SaleRecord = {
      id: 'sale-1',
      totalCents: 2000,
      status: 'COMPLETED',
      paymentMethod: 'CASH',
      discountCents: 0,
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
```

with:

```typescript
  it('hides a previous success message once a new item is scanned into a fresh sale', async () => {
    const user = userEvent.setup()
    const sale: SaleRecord = {
      id: 'sale-1',
      totalCents: 2000,
      status: 'COMPLETED',
      paymentMethod: 'CASH',
      discountCents: 0,
      createdAt: '2026-09-03T00:00:00.000Z',
      items: []
    }
    ;(window.api.sales.complete as ReturnType<typeof vi.fn>).mockResolvedValue(sale)

    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByText('Coke')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Finish Sale' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Cash' }))
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })
```

Run: `npx vitest run src/renderer/src/features/cart/PosPage.test.tsx` — expect FAIL (no modal exists yet in `PosPage`).

- [ ] **Step 7: Wire the modal into `PosPage`**

Change `src/renderer/src/features/cart/PosPage.tsx` from:

```typescript
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
  const { inputRef, value, setValue, error, handleKeyDown, clearError } = useBarcodeScan()
  const {
    completing,
    error: saleError,
    completeSale,
    clearError: clearSaleError
  } = useCompleteSale()
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
```

to:

```typescript
import { useEffect, useState } from 'react'
import { useCartStore, cartTotalCents } from './cartStore'
import { useBarcodeScan } from './useBarcodeScan'
import { useCompleteSale } from './useCompleteSale'
import CartTable from './CartTable'
import PaymentMethodModal from './PaymentMethodModal'
import { Money } from '../../../../shared/money'
import type { PaymentMethod } from '../../../../shared/sale'

function PosPage(): React.JSX.Element {
  const items = useCartStore((state) => state.items)
  const incrementItem = useCartStore((state) => state.incrementItem)
  const decrementItem = useCartStore((state) => state.decrementItem)
  const removeItem = useCartStore((state) => state.removeItem)
  const clear = useCartStore((state) => state.clear)
  const { inputRef, value, setValue, error, handleKeyDown, clearError } = useBarcodeScan()
  const {
    completing,
    error: saleError,
    completeSale,
    clearError: clearSaleError
  } = useCompleteSale()
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
```

Change:

```typescript
  async function handleFinishSale(): Promise<void> {
    const sale = await completeSale()
    if (sale) {
      setSuccessMessage(`Sale completed — ${Money.fromCents(sale.totalCents).format()}`)
    }
  }
```

to:

```typescript
  function handleFinishSaleClick(): void {
    setShowPaymentModal(true)
  }

  async function handleSelectPaymentMethod(method: PaymentMethod): Promise<void> {
    const sale = await completeSale(method)
    setShowPaymentModal(false)
    if (sale) {
      setSuccessMessage(`Sale completed — ${Money.fromCents(sale.totalCents).format()}`)
    }
  }

  function handleCancelPaymentModal(): void {
    setShowPaymentModal(false)
  }
```

Change the "Finish Sale" button's `onClick` from `onClick={handleFinishSale}` to `onClick={handleFinishSaleClick}` (no other change to that button).

Finally, add the modal render right after the closing `</div>` of `.pos-footer` and before the component's final closing `</div>`:

```typescript
      {showPaymentModal && (
        <PaymentMethodModal
          submitting={completing}
          onSelect={handleSelectPaymentMethod}
          onCancel={handleCancelPaymentModal}
        />
      )}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/src/features/cart/PosPage.test.tsx`
Expected: PASS (all tests, old and updated).

- [ ] **Step 9: Run the full suite, typecheck, and lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS / 0 errors, no remaining references to the old `completeSale()`/`sales.complete(items)` call shapes anywhere in the codebase.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/features/cart/PaymentMethodModal.tsx src/renderer/src/features/cart/PaymentMethodModal.test.tsx src/renderer/src/features/cart/useCompleteSale.ts src/renderer/src/features/cart/useCompleteSale.test.ts src/renderer/src/features/cart/PosPage.tsx src/renderer/src/features/cart/PosPage.test.tsx src/renderer/src/assets/main.css
git commit -m "feat: add payment method selection to the Finish Sale flow"
```
