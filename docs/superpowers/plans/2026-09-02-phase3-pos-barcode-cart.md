# POS MVP — Phase 3: POS + Barcode + Cart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a cashier scan a product's barcode with a USB keyboard-emulation scanner, watch it appear in a running cart with a correctly calculated total, adjust quantities, and remove items — everything up to (but not including) actually completing the sale.

**Architecture:** A `Money` value object (integer satang, never floats) becomes the single source of truth for price math and formatting, replacing the three duplicated baht↔cents conversions the Products UI accumulated in Phases 1-2. An exact-match `getProductByBarcode` repository function (distinct from the Products screen's fuzzy `searchProducts`) is exposed over a new IPC channel. Cart state lives in a Zustand store — the one piece of state in this app that's genuinely cross-cutting (a barcode scan anywhere on the POS screen must update a cart table and a total display elsewhere), which is exactly the case the product spec names Zustand for. A simple two-tab shell (`POS` / `Products`) replaces the single-screen `App.tsx`.

**Tech Stack:** Same as Phases 1-2 (Electron, React, TypeScript, Drizzle ORM, better-sqlite3, Vitest, React Testing Library) plus `zustand` — this plan's first genuinely cross-cutting client state is what the spec reserves Zustand for.

This plan implements **Development Roadmap Phase 3** (spec §15: "POS + Barcode + Cart" — exit criteria "Scan แล้วคิดราคาได้ถูกต้อง" / "scan and the price calculates correctly"). It deliberately stops short of actually completing a sale — see "What Phase 3 deliberately does not cover" at the end.

## Global Constraints

From `POS_MVP_Product_Technical_Specification.docx` and this project's established architecture — every task's requirements implicitly include these:

- **The renderer must never touch SQLite/Drizzle directly** — already ESLint-enforced (`eslint.config.mjs`) since Phase 2; nothing in this plan adds a new hole in that boundary.
- Money is never stored or computed as floating point — persist and compute as an integer number of satang (spec §6.2, §11.1). This plan centralizes that rule in one `Money` class instead of leaving it as scattered `Math.round(x * 100)` calls.
- Barcode lookup for scanning is an **exact match only** — the Products screen's `searchProducts` (substring `LIKE`) is for the human typing into a search box, not for a scanner firing an exact code (spec §7.2 vs §10.1; this distinction was called out explicitly in Phase 2's plan).
- Scanning the same barcode again increments the existing cart line's quantity rather than creating a duplicate line (spec §6.2).
- The price used for a cart line snapshots at the moment it's first added and does not change even if the product's price changes later or the barcode is scanned again (spec §6.2, and consistent with how `sale_items` will snapshot price in Phase 4).
- **MVP policy: never allow a cart line's quantity to exceed the product's current stock** — no setting to relax this yet (spec §6.1/US-08 "ห้ามขายเกิน Stock").
- Scanning a barcode with no matching product shows a clear message and adds nothing (spec §7.2/US-07).
- USB barcode scanners in this app work as **keyboard-emulation** devices: they type the code's characters, then send Enter (spec §10.1) — the scan field must respond to Enter, not to every keystroke.
- Suggested tech stack additions: Zustand for Cart/UI state specifically (spec §9) — not a general-purpose replacement for the `useState`/custom-hook pattern already used for Products, which stays as-is.
- No backend, microservices, or cloud sync at this stage (spec §16, §18 "Over-engineering").

---

## File Structure

```
MyProject/
├── package.json                                            # + zustand dependency (Task 3)
├── src/
│   ├── shared/
│   │   ├── money.ts                                        # Money value object — single source of truth for price math (Task 1)
│   │   └── money.test.ts
│   ├── main/
│   │   ├── database/repositories/
│   │   │   ├── product-repository.ts                       # + getProductByBarcode (Task 2)
│   │   │   └── product-repository.test.ts
│   │   └── ipc/
│   │       ├── register-product-handlers.ts                # + products:getByBarcode channel (Task 2)
│   │       └── register-product-handlers.test.ts
│   ├── preload/
│   │   ├── index.ts                                        # + api.products.getByBarcode (Task 2)
│   │   └── index.d.ts
│   └── renderer/src/
│       ├── App.tsx                                          # + POS/Products tab shell (Task 5)
│       ├── App.test.tsx                                     # new (Task 5)
│       ├── features/
│       │   ├── products/
│       │   │   ├── ProductList.tsx                          # price formatting now goes through Money (Task 1)
│       │   │   └── ProductForm.tsx                          # price parsing/validation now goes through Money (Task 1)
│       │   └── cart/
│       │       ├── cartStore.ts                              # Zustand store: items, add/increment/decrement/setQuantity/remove/clear (Task 3)
│       │       ├── cartStore.test.ts
│       │       ├── CartTable.tsx                              # presentational cart table (Task 4)
│       │       ├── CartTable.test.tsx
│       │       ├── useBarcodeScan.ts                          # scan-field hook: lookup, add-to-cart, error state (Task 5)
│       │       ├── useBarcodeScan.test.ts
│       │       ├── PosPage.tsx                                 # composes scan field + cart table + total + clear (Task 5)
│       │       └── PosPage.test.tsx
```

`src/shared/money.ts` sits alongside `src/shared/product.ts` — both are dependency-free contracts used by all three processes. `src/renderer/src/features/cart/` mirrors the `features/products/` layout Phase 2 established.

---

### Task 1: `Money` value object + retrofit the Products UI to use it

**Files:**
- Create: `src/shared/money.ts`
- Test: `src/shared/money.test.ts`
- Modify: `src/renderer/src/features/products/ProductList.tsx`
- Modify: `src/renderer/src/features/products/ProductForm.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `class Money` with `static fromCents(cents: number): Money`, `static fromBaht(baht: number): Money`, `static parseBaht(input: string): Money | null`, `get cents(): number`, `toBaht(): number`, `add(other: Money): Money`, `multiply(quantity: number): Money`, `format(): string` (renders `"฿20.00"`), `equals(other: Money): boolean`. Every later task that touches money (Task 4's cart line totals, Task 5's cart total) uses this class — do not reimplement baht↔cents conversion anywhere else in this plan.

- [ ] **Step 1: Write the failing test**

Create `src/shared/money.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { Money } from './money'

describe('Money', () => {
  it('converts baht to integer satang cents', () => {
    expect(Money.fromBaht(20.5).cents).toBe(2050)
  })

  it('rejects negative amounts', () => {
    expect(() => Money.fromBaht(-1)).toThrow('cannot be negative')
  })

  it('rejects non-integer cents', () => {
    expect(() => Money.fromCents(10.5)).toThrow('integer number of satang')
  })

  it('adds two amounts without floating-point drift', () => {
    const a = Money.fromBaht(0.1)
    const b = Money.fromBaht(0.2)
    expect(a.add(b).cents).toBe(30)
  })

  it('computes a line total as unit price times quantity', () => {
    const unitPrice = Money.fromBaht(20)
    expect(unitPrice.multiply(3).cents).toBe(6000)
  })

  it('rejects a negative or fractional quantity', () => {
    const unitPrice = Money.fromBaht(20)
    expect(() => unitPrice.multiply(-1)).toThrow('non-negative integer')
    expect(() => unitPrice.multiply(1.5)).toThrow('non-negative integer')
  })

  it('formats as Thai baht with a currency symbol', () => {
    expect(Money.fromCents(124000).format()).toBe('฿1240.00')
  })

  it('compares equality by cents', () => {
    expect(Money.fromBaht(10).equals(Money.fromCents(1000))).toBe(true)
    expect(Money.fromBaht(10).equals(Money.fromCents(1001))).toBe(false)
  })

  it('parses a valid baht string from user input', () => {
    expect(Money.parseBaht('20.50')?.cents).toBe(2050)
  })

  it('returns null for empty, non-numeric, or negative baht input', () => {
    expect(Money.parseBaht('')).toBeNull()
    expect(Money.parseBaht('   ')).toBeNull()
    expect(Money.parseBaht('abc')).toBeNull()
    expect(Money.parseBaht('-5')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `./money` module not found.

- [ ] **Step 3: Write the implementation**

Create `src/shared/money.ts`:

```ts
export class Money {
  private constructor(private readonly _cents: number) {}

  static fromCents(cents: number): Money {
    if (!Number.isInteger(cents)) {
      throw new Error(`Money must be an integer number of satang, got ${cents}`)
    }
    if (cents < 0) {
      throw new Error(`Money cannot be negative, got ${cents}`)
    }
    return new Money(cents)
  }

  static fromBaht(baht: number): Money {
    return Money.fromCents(Math.round(baht * 100))
  }

  static parseBaht(input: string): Money | null {
    if (input.trim().length === 0) {
      return null
    }
    const baht = Number(input)
    if (!Number.isFinite(baht)) {
      return null
    }
    const cents = Math.round(baht * 100)
    if (cents < 0) {
      return null
    }
    return Money.fromCents(cents)
  }

  get cents(): number {
    return this._cents
  }

  toBaht(): number {
    return this._cents / 100
  }

  add(other: Money): Money {
    return Money.fromCents(this._cents + other._cents)
  }

  multiply(quantity: number): Money {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new Error(`Quantity must be a non-negative integer, got ${quantity}`)
    }
    return Money.fromCents(this._cents * quantity)
  }

  format(): string {
    return `฿${this.toBaht().toFixed(2)}`
  }

  equals(other: Money): boolean {
    return this._cents === other._cents
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS (all `money.test.ts` cases).

- [ ] **Step 5: Retrofit `ProductList.tsx` to format price through `Money`**

Open `src/renderer/src/features/products/ProductList.tsx`. Remove the local `formatBaht` helper function entirely:

```ts
function formatBaht(cents: number): string {
  return `฿${(cents / 100).toFixed(2)}`
}
```

Add to the imports:

```ts
import { Money } from '../../../../shared/money'
```

Replace the price cell:

```tsx
<td className="cell-price">{formatBaht(product.priceCents)}</td>
```

with:

```tsx
<td className="cell-price">{Money.fromCents(product.priceCents).format()}</td>
```

This produces byte-identical output to the old `formatBaht` (`"฿20.00"`), so `ProductList.test.tsx`'s existing assertions (`getByText('฿20.00')`, etc.) do not need to change.

- [ ] **Step 6: Retrofit `ProductForm.tsx` to parse/validate price through `Money`**

Open `src/renderer/src/features/products/ProductForm.tsx`. Add to the imports:

```ts
import { Money } from '../../../../shared/money'
```

Replace the initial state derivation:

```ts
const [priceBaht, setPriceBaht] = useState(
  initialValues ? (initialValues.priceCents / 100).toString() : ''
)
```

with:

```ts
const [priceBaht, setPriceBaht] = useState(
  initialValues ? Money.fromCents(initialValues.priceCents).toBaht().toString() : ''
)
```

Replace the price validation block inside `handleSubmit`:

```ts
if (priceBaht.trim().length === 0) {
  setFormError('Price is required')
  return
}
const priceCents = Math.round(Number(priceBaht) * 100)
if (!Number.isFinite(priceCents) || priceCents < 0) {
  setFormError('Price must be a non-negative number')
  return
}
```

with:

```ts
if (priceBaht.trim().length === 0) {
  setFormError('Price is required')
  return
}
const price = Money.parseBaht(priceBaht)
if (!price) {
  setFormError('Price must be a non-negative number')
  return
}
const priceCents = price.cents
```

The rest of `handleSubmit` (which reads the local `priceCents` variable) is unchanged. This preserves every existing validation message and behavior exactly, so `ProductForm.test.tsx`'s existing tests do not need to change.

- [ ] **Step 7: Run the full suite to confirm nothing broke**

```bash
npm test
```

Expected: PASS — all pre-existing Product tests still green, plus all new `money.test.ts` cases.

- [ ] **Step 8: Commit**

```bash
git add src/shared/money.ts src/shared/money.test.ts src/renderer/src/features/products/ProductList.tsx src/renderer/src/features/products/ProductForm.tsx
git commit -m "feat: add Money value object, retrofit Products UI to use it"
```

---

### Task 2: Exact-match barcode lookup (repository + IPC + preload)

**Files:**
- Modify: `src/main/database/repositories/product-repository.ts`
- Modify: `src/main/database/repositories/product-repository.test.ts`
- Modify: `src/main/ipc/register-product-handlers.ts`
- Modify: `src/main/ipc/register-product-handlers.test.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

**Interfaces:**
- Consumes: `products` table, `ProductRecord` from Phase 2 (unchanged).
- Produces: `getProductByBarcode(db: BetterSQLite3Database, barcode: string): ProductRecord | undefined` (repository); IPC channel `products:getByBarcode`; `window.api.products.getByBarcode(barcode: string): Promise<ProductRecord | null>` — this exact name/signature is what Task 5's `useBarcodeScan` hook calls. Note it resolves `undefined` (repository) to `null` (over IPC/preload) since `undefined` doesn't survive structured-clone serialization reliably — always check `=== null`, not falsiness, on the renderer side going forward.

This function deliberately returns a match **regardless of `isActive`** — the caller (Task 5's scan handler) is responsible for deciding what an inactive match means to the user (a different message than "not found"). Keeping the repository function unopinionated keeps it reusable.

- [ ] **Step 1: Write the failing test**

Open `src/main/database/repositories/product-repository.test.ts`. Add to the imports:

```ts
import {
  createProduct,
  updateProduct,
  getProductById,
  getProductByBarcode,
  searchProducts,
  ProductValidationError,
  DuplicateBarcodeError,
  ProductNotFoundError
} from './product-repository'
```

(This replaces the existing import line that lists the same names minus `getProductByBarcode` — add just that one name, don't duplicate the import statement.)

Add these test cases inside the existing `describe('product repository', ...)` block, after the `searches products by barcode or name substring` test:

```ts
it('finds a product by its exact barcode', () => {
  createProduct(client.db, {
    barcode: '8850001000012',
    name: 'Coca Cola',
    priceCents: 2000,
    stock: 50
  })

  const found = getProductByBarcode(client.db, '8850001000012')
  expect(found?.name).toBe('Coca Cola')
})

it('does not match a barcode substring, only an exact match', () => {
  createProduct(client.db, {
    barcode: '8850001000012',
    name: 'Coca Cola',
    priceCents: 2000,
    stock: 50
  })

  expect(getProductByBarcode(client.db, '885000100001')).toBeUndefined()
  expect(getProductByBarcode(client.db, '88500010000123')).toBeUndefined()
})

it('returns undefined for a barcode that does not exist', () => {
  expect(getProductByBarcode(client.db, 'does-not-exist')).toBeUndefined()
})

it('still returns an inactive product by barcode — callers decide whether inactive is sellable', () => {
  const created = createProduct(client.db, { barcode: '999', name: 'A', priceCents: 100, stock: 1 })
  updateProduct(client.db, created.id, { isActive: false })

  const found = getProductByBarcode(client.db, '999')
  expect(found?.isActive).toBe(false)
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `getProductByBarcode` is not exported from `./product-repository`.

- [ ] **Step 3: Write the implementation**

Open `src/main/database/repositories/product-repository.ts`. Add this function after `getProductById` (the `eq` import already exists at the top of the file — do not add a second import for it):

```ts
export function getProductByBarcode(
  db: BetterSQLite3Database,
  barcode: string
): ProductRecord | undefined {
  return db.select().from(products).where(eq(products.barcode, barcode)).get() as
    | ProductRecord
    | undefined
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS (all 4 new cases, plus every pre-existing test still passing).

- [ ] **Step 5: Write the failing test for the IPC handler**

Open `src/main/ipc/register-product-handlers.test.ts`. Add this case inside the existing `describe('registerProductHandlers', ...)` block:

```ts
it('products:getByBarcode returns the matching product, or null when there is no match', () => {
  const createHandler = handlers.get('products:create')!
  const getByBarcodeHandler = handlers.get('products:getByBarcode')!

  createHandler({}, { barcode: '555', name: 'A', priceCents: 100, stock: 1 })

  const found = getByBarcodeHandler({}, '555') as { name: string } | null
  expect(found?.name).toBe('A')

  expect(getByBarcodeHandler({}, 'nope')).toBeNull()
})
```

Also update the existing `registers products:list, products:create, and products:update` test's title and body to include the new channel — replace it with:

```ts
it('registers products:list, products:create, products:update, and products:getByBarcode', () => {
  expect(handlers.has('products:list')).toBe(true)
  expect(handlers.has('products:create')).toBe(true)
  expect(handlers.has('products:update')).toBe(true)
  expect(handlers.has('products:getByBarcode')).toBe(true)
})
```

- [ ] **Step 6: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `handlers.get('products:getByBarcode')` is `undefined`, so calling it as a function throws.

- [ ] **Step 7: Register the IPC handler**

Open `src/main/ipc/register-product-handlers.ts`. Change the import line:

```ts
import { createProduct, updateProduct, searchProducts } from '../database/repositories/product-repository'
```

to:

```ts
import {
  createProduct,
  updateProduct,
  searchProducts,
  getProductByBarcode
} from '../database/repositories/product-repository'
```

Add this handler inside `registerProductHandlers`, after the `products:update` handler:

```ts
ipcMain.handle('products:getByBarcode', (_event, barcode: string): ProductRecord | null => {
  return getProductByBarcode(db, barcode) ?? null
})
```

- [ ] **Step 8: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS (all cases, including the new/updated ones in `register-product-handlers.test.ts`).

- [ ] **Step 9: Expose the method from the preload script**

Open `src/preload/index.ts`. Change the `api.products` object from:

```ts
products: {
  list: (query?: string): Promise<ProductRecord[]> => ipcRenderer.invoke('products:list', query),
  create: (input: CreateProductInput): Promise<ProductRecord> =>
    ipcRenderer.invoke('products:create', input),
  update: (id: string, input: UpdateProductInput): Promise<ProductRecord> =>
    ipcRenderer.invoke('products:update', id, input)
}
```

to:

```ts
products: {
  list: (query?: string): Promise<ProductRecord[]> => ipcRenderer.invoke('products:list', query),
  create: (input: CreateProductInput): Promise<ProductRecord> =>
    ipcRenderer.invoke('products:create', input),
  update: (id: string, input: UpdateProductInput): Promise<ProductRecord> =>
    ipcRenderer.invoke('products:update', id, input),
  getByBarcode: (barcode: string): Promise<ProductRecord | null> =>
    ipcRenderer.invoke('products:getByBarcode', barcode)
}
```

- [ ] **Step 10: Add the matching type to the preload's ambient declarations**

Open `src/preload/index.d.ts`. Change the `Window.api.products` type from:

```ts
products: {
  list: (query?: string) => Promise<ProductRecord[]>
  create: (input: CreateProductInput) => Promise<ProductRecord>
  update: (id: string, input: UpdateProductInput) => Promise<ProductRecord>
}
```

to:

```ts
products: {
  list: (query?: string) => Promise<ProductRecord[]>
  create: (input: CreateProductInput) => Promise<ProductRecord>
  update: (id: string, input: UpdateProductInput) => Promise<ProductRecord>
  getByBarcode: (barcode: string) => Promise<ProductRecord | null>
}
```

- [ ] **Step 11: Verify typecheck and the full suite**

```bash
npm run typecheck
npm test
```

Expected: both clean.

- [ ] **Step 12: Commit**

```bash
git add src/main/database/repositories/product-repository.ts src/main/database/repositories/product-repository.test.ts src/main/ipc/register-product-handlers.ts src/main/ipc/register-product-handlers.test.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat: add exact-match barcode lookup over IPC"
```

---

### Task 3: Cart Zustand store

**Files:**
- Modify: `package.json` (add `zustand` dependency)
- Create: `src/renderer/src/features/cart/cartStore.ts`
- Test: `src/renderer/src/features/cart/cartStore.test.ts`

**Interfaces:**
- Consumes: `Money` from `src/shared/money.ts` (Task 1).
- Produces (all from `cartStore.ts`):
  - `interface CartItem { productId: string; barcode: string; name: string; unitPriceCents: number; stock: number; quantity: number }`
  - `interface ScannedProduct { id: string; barcode: string; name: string; priceCents: number; stock: number }` — note this is structurally satisfied by `ProductRecord` (Phase 2), so a `ProductRecord` can be passed anywhere a `ScannedProduct` is expected without casting.
  - `type CartActionResult = { ok: true } | { ok: false; reason: 'out-of-stock' | 'not-found' }`
  - `useCartStore` — a Zustand hook/store exposing `items: CartItem[]`, `addScannedProduct(product: ScannedProduct): CartActionResult`, `incrementItem(productId: string): CartActionResult`, `decrementItem(productId: string): void`, `setQuantity(productId: string, quantity: number): void`, `removeItem(productId: string): void`, `clear(): void`. Also usable outside React via `useCartStore.getState()` / `useCartStore.setState()`.
  - `lineTotalCents(item: CartItem): number` and `cartTotalCents(items: CartItem[]): number` — plain functions, not part of the store.

These exact names are what Task 4's `CartTable` and Task 5's `PosPage`/`useBarcodeScan` consume — do not rename anything here without updating those tasks too.

- [ ] **Step 1: Install zustand**

```bash
cd D:\Work\Sandbox\MyProject
npm install zustand
```

- [ ] **Step 2: Write the failing test**

Create `src/renderer/src/features/cart/cartStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useCartStore, lineTotalCents, cartTotalCents } from './cartStore'

const coke = { id: '1', barcode: '111', name: 'Coke', priceCents: 2000, stock: 5 }
const water = { id: '2', barcode: '222', name: 'Water', priceCents: 1000, stock: 1 }

describe('useCartStore', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [] })
  })

  it('adds a newly scanned product as a quantity-1 line', () => {
    const result = useCartStore.getState().addScannedProduct(coke)
    expect(result).toEqual({ ok: true })
    expect(useCartStore.getState().items).toEqual([
      { productId: '1', barcode: '111', name: 'Coke', unitPriceCents: 2000, stock: 5, quantity: 1 }
    ])
  })

  it('increments quantity when the same product is scanned again', () => {
    useCartStore.getState().addScannedProduct(coke)
    useCartStore.getState().addScannedProduct(coke)
    expect(useCartStore.getState().items[0].quantity).toBe(2)
    expect(useCartStore.getState().items).toHaveLength(1)
  })

  it('rejects adding beyond the product\'s available stock', () => {
    for (let i = 0; i < water.stock; i++) {
      useCartStore.getState().addScannedProduct(water)
    }
    const result = useCartStore.getState().addScannedProduct(water)
    expect(result).toEqual({ ok: false, reason: 'out-of-stock' })
    expect(useCartStore.getState().items[0].quantity).toBe(1)
  })

  it('rejects scanning a product that is already out of stock', () => {
    const result = useCartStore.getState().addScannedProduct({ ...water, stock: 0 })
    expect(result).toEqual({ ok: false, reason: 'out-of-stock' })
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('snapshots the price at add time and keeps it on repeat scans even if price changes', () => {
    useCartStore.getState().addScannedProduct(coke)
    useCartStore.getState().addScannedProduct({ ...coke, priceCents: 9999 })
    expect(useCartStore.getState().items[0].unitPriceCents).toBe(2000)
  })

  it('incrementItem respects the stored stock ceiling', () => {
    useCartStore.getState().addScannedProduct(water)
    const result = useCartStore.getState().incrementItem('2')
    expect(result).toEqual({ ok: false, reason: 'out-of-stock' })
    expect(useCartStore.getState().items[0].quantity).toBe(1)
  })

  it('incrementItem reports not-found for a product not in the cart', () => {
    const result = useCartStore.getState().incrementItem('does-not-exist')
    expect(result).toEqual({ ok: false, reason: 'not-found' })
  })

  it('decrementItem never goes below quantity 1', () => {
    useCartStore.getState().addScannedProduct(coke)
    useCartStore.getState().decrementItem('1')
    expect(useCartStore.getState().items[0].quantity).toBe(1)
  })

  it('setQuantity clamps to the stored stock and ignores invalid values', () => {
    useCartStore.getState().addScannedProduct(coke)
    useCartStore.getState().setQuantity('1', 3)
    expect(useCartStore.getState().items[0].quantity).toBe(3)
    useCartStore.getState().setQuantity('1', 999)
    expect(useCartStore.getState().items[0].quantity).toBe(5)
    useCartStore.getState().setQuantity('1', 0)
    expect(useCartStore.getState().items[0].quantity).toBe(5)
  })

  it('removeItem deletes the line entirely', () => {
    useCartStore.getState().addScannedProduct(coke)
    useCartStore.getState().removeItem('1')
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('clear empties the cart', () => {
    useCartStore.getState().addScannedProduct(coke)
    useCartStore.getState().addScannedProduct(water)
    useCartStore.getState().clear()
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('computes line and cart totals using integer-cents money math', () => {
    useCartStore.getState().addScannedProduct(coke)
    useCartStore.getState().incrementItem('1')
    useCartStore.getState().addScannedProduct(water)

    const items = useCartStore.getState().items
    expect(lineTotalCents(items[0])).toBe(4000)
    expect(cartTotalCents(items)).toBe(5000)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `./cartStore` module not found.

- [ ] **Step 4: Write the implementation**

Create `src/renderer/src/features/cart/cartStore.ts`:

```ts
import { create } from 'zustand'
import { Money } from '../../../../shared/money'

export interface CartItem {
  productId: string
  barcode: string
  name: string
  unitPriceCents: number
  stock: number
  quantity: number
}

export interface ScannedProduct {
  id: string
  barcode: string
  name: string
  priceCents: number
  stock: number
}

export type CartActionResult = { ok: true } | { ok: false; reason: 'out-of-stock' | 'not-found' }

interface CartState {
  items: CartItem[]
  addScannedProduct: (product: ScannedProduct) => CartActionResult
  incrementItem: (productId: string) => CartActionResult
  decrementItem: (productId: string) => void
  setQuantity: (productId: string, quantity: number) => void
  removeItem: (productId: string) => void
  clear: () => void
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addScannedProduct: (product) => {
    const existing = get().items.find((item) => item.productId === product.id)

    if (existing) {
      if (existing.quantity + 1 > product.stock) {
        return { ok: false, reason: 'out-of-stock' }
      }
      set({
        items: get().items.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1, stock: product.stock }
            : item
        )
      })
      return { ok: true }
    }

    if (product.stock < 1) {
      return { ok: false, reason: 'out-of-stock' }
    }

    set({
      items: [
        ...get().items,
        {
          productId: product.id,
          barcode: product.barcode,
          name: product.name,
          unitPriceCents: product.priceCents,
          stock: product.stock,
          quantity: 1
        }
      ]
    })
    return { ok: true }
  },

  incrementItem: (productId) => {
    const item = get().items.find((i) => i.productId === productId)
    if (!item) {
      return { ok: false, reason: 'not-found' }
    }
    if (item.quantity + 1 > item.stock) {
      return { ok: false, reason: 'out-of-stock' }
    }
    set({
      items: get().items.map((i) =>
        i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i
      )
    })
    return { ok: true }
  },

  decrementItem: (productId) => {
    set({
      items: get().items.map((item) =>
        item.productId === productId && item.quantity > 1
          ? { ...item, quantity: item.quantity - 1 }
          : item
      )
    })
  },

  setQuantity: (productId, quantity) => {
    if (!Number.isInteger(quantity) || quantity < 1) {
      return
    }
    set({
      items: get().items.map((item) =>
        item.productId === productId ? { ...item, quantity: Math.min(quantity, item.stock) } : item
      )
    })
  },

  removeItem: (productId) => {
    set({ items: get().items.filter((item) => item.productId !== productId) })
  },

  clear: () => set({ items: [] })
}))

export function lineTotalCents(item: CartItem): number {
  return Money.fromCents(item.unitPriceCents).multiply(item.quantity).cents
}

export function cartTotalCents(items: CartItem[]): number {
  return items.reduce((total, item) => total + lineTotalCents(item), 0)
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS (all `cartStore.test.ts` cases, plus every pre-existing test still passing).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/renderer/src/features/cart/cartStore.ts src/renderer/src/features/cart/cartStore.test.ts
git commit -m "feat: add cart Zustand store with stock ceiling and price snapshotting"
```

---

### Task 4: `CartTable` presentational component

**Files:**
- Create: `src/renderer/src/features/cart/CartTable.tsx`
- Test: `src/renderer/src/features/cart/CartTable.test.tsx`
- Modify: `src/renderer/src/assets/main.css` (cart-specific styles)

**Interfaces:**
- Consumes: `CartItem`, `lineTotalCents` from `cartStore.ts` (Task 3); `Money` from `src/shared/money.ts` (Task 1).
- Produces: `<CartTable items={CartItem[]} onIncrement={(productId: string) => void} onDecrement={(productId: string) => void} onRemove={(productId: string) => void} />` — purely presentational, no store access of its own (matches this project's established pattern: `ProductList`/`ProductForm` don't call `useProducts()` either). This exact prop shape is what Task 5's `PosPage` renders.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/features/cart/CartTable.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CartTable from './CartTable'
import type { CartItem } from './cartStore'

const items: CartItem[] = [
  { productId: '1', barcode: '111', name: 'Coke', unitPriceCents: 2000, stock: 5, quantity: 2 },
  { productId: '2', barcode: '222', name: 'Water', unitPriceCents: 1000, stock: 1, quantity: 1 }
]

describe('CartTable', () => {
  it('shows an empty state when the cart has no items', () => {
    render(<CartTable items={[]} onIncrement={vi.fn()} onDecrement={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('Cart is empty')).toBeInTheDocument()
  })

  it('renders a row per cart item with formatted unit price and line total', () => {
    render(<CartTable items={items} onIncrement={vi.fn()} onDecrement={vi.fn()} onRemove={vi.fn()} />)

    expect(screen.getByText('Coke')).toBeInTheDocument()
    expect(screen.getByText('฿20.00')).toBeInTheDocument()
    expect(screen.getByText('฿40.00')).toBeInTheDocument()
    expect(screen.getByText('Water')).toBeInTheDocument()
    expect(screen.getByText('฿10.00')).toBeInTheDocument()
  })

  it('calls onIncrement/onDecrement when the stepper buttons are clicked', async () => {
    const user = userEvent.setup()
    const onIncrement = vi.fn()
    const onDecrement = vi.fn()
    render(
      <CartTable items={items} onIncrement={onIncrement} onDecrement={onDecrement} onRemove={vi.fn()} />
    )

    await user.click(screen.getByLabelText('Increase quantity of Coke'))
    expect(onIncrement).toHaveBeenCalledWith('1')

    await user.click(screen.getByLabelText('Decrease quantity of Coke'))
    expect(onDecrement).toHaveBeenCalledWith('1')
  })

  it('disables the increment button once quantity reaches the known stock', () => {
    render(<CartTable items={items} onIncrement={vi.fn()} onDecrement={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByLabelText('Increase quantity of Water')).toBeDisabled()
  })

  it('disables the decrement button at quantity 1', () => {
    render(<CartTable items={items} onIncrement={vi.fn()} onDecrement={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByLabelText('Decrease quantity of Water')).toBeDisabled()
  })

  it('calls onRemove with the product id when Remove is clicked', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(<CartTable items={items} onIncrement={vi.fn()} onDecrement={vi.fn()} onRemove={onRemove} />)

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    expect(onRemove).toHaveBeenCalledWith('1')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `./CartTable` module not found.

- [ ] **Step 3: Write `CartTable`**

Create `src/renderer/src/features/cart/CartTable.tsx`:

```tsx
import { Money } from '../../../../shared/money'
import { lineTotalCents, type CartItem } from './cartStore'

export interface CartTableProps {
  items: CartItem[]
  onIncrement: (productId: string) => void
  onDecrement: (productId: string) => void
  onRemove: (productId: string) => void
}

function CartIcon(): React.JSX.Element {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="21" r="1.4" fill="currentColor" />
      <circle cx="17" cy="21" r="1.4" fill="currentColor" />
    </svg>
  )
}

function CartTable({ items, onIncrement, onDecrement, onRemove }: CartTableProps): React.JSX.Element {
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <CartIcon />
        <h2>Cart is empty</h2>
        <p>Scan a product&apos;s barcode to add it to the sale.</p>
      </div>
    )
  }

  return (
    <table className="products-table">
      <thead>
        <tr>
          <th>Barcode</th>
          <th>Product</th>
          <th className="col-price">Unit Price</th>
          <th className="col-stock">Qty</th>
          <th className="col-price">Line Total</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.productId}>
            <td className="cell-barcode">{item.barcode}</td>
            <td>{item.name}</td>
            <td className="cell-price">{Money.fromCents(item.unitPriceCents).format()}</td>
            <td className="cell-stock">
              <div className="qty-stepper">
                <button
                  type="button"
                  className="btn btn-secondary btn-icon"
                  onClick={() => onDecrement(item.productId)}
                  disabled={item.quantity <= 1}
                  aria-label={`Decrease quantity of ${item.name}`}
                >
                  −
                </button>
                <span>{item.quantity}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-icon"
                  onClick={() => onIncrement(item.productId)}
                  disabled={item.quantity >= item.stock}
                  aria-label={`Increase quantity of ${item.name}`}
                >
                  +
                </button>
              </div>
            </td>
            <td className="cell-price">{Money.fromCents(lineTotalCents(item)).format()}</td>
            <td className="cell-actions">
              <button type="button" className="btn btn-secondary" onClick={() => onRemove(item.productId)}>
                Remove
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default CartTable
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS (all `CartTable.test.tsx` cases).

- [ ] **Step 5: Add the cart-specific CSS**

Open `src/renderer/src/assets/main.css`. Add at the end of the file:

```css
.qty-stepper {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  justify-content: flex-end;
}

.qty-stepper span {
  min-width: 20px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.btn-icon {
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/features/cart/CartTable.tsx src/renderer/src/features/cart/CartTable.test.tsx src/renderer/src/assets/main.css
git commit -m "feat: add CartTable presentational component"
```

---

### Task 5: Barcode scan + `PosPage` + wire into the app shell

**Files:**
- Create: `src/renderer/src/features/cart/useBarcodeScan.ts`
- Test: `src/renderer/src/features/cart/useBarcodeScan.test.ts`
- Create: `src/renderer/src/features/cart/PosPage.tsx`
- Test: `src/renderer/src/features/cart/PosPage.test.tsx`
- Modify: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/App.test.tsx`
- Modify: `src/renderer/src/assets/main.css` (app shell / tab nav / scan field / total styles)

**Interfaces:**
- Consumes: `useCartStore`, `cartTotalCents` (Task 3); `CartTable` (Task 4); `Money` (Task 1); `window.api.products.getByBarcode` (Task 2).
- Produces: `useBarcodeScan(): { inputRef: React.RefObject<HTMLInputElement | null>; value: string; setValue: (value: string) => void; error: string | null; handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void }`; `<PosPage />` — self-contained, no props; a two-tab `App.tsx` (`POS` / `Products`).

- [ ] **Step 1: Write the failing test for the scan hook**

Create `src/renderer/src/features/cart/useBarcodeScan.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useBarcodeScan } from './useBarcodeScan'
import { useCartStore } from './cartStore'
import type { ProductRecord } from '../../../../shared/product'

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

function pressEnter(
  handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
): Promise<void> {
  return act(async () => {
    handleKeyDown({ key: 'Enter', preventDefault: () => {} } as React.KeyboardEvent<HTMLInputElement>)
  })
}

describe('useBarcodeScan', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [] })
    window.api = {
      dbHealth: vi.fn(),
      products: {
        list: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        getByBarcode: vi.fn()
      }
    } as unknown as Window['api']
  })

  it('adds the scanned product to the cart on Enter and clears the field', async () => {
    ;(window.api.products.getByBarcode as ReturnType<typeof vi.fn>).mockResolvedValue(coke)
    const { result } = renderHook(() => useBarcodeScan())

    act(() => result.current.setValue('111'))
    await pressEnter(result.current.handleKeyDown)

    await waitFor(() => expect(useCartStore.getState().items).toHaveLength(1))
    expect(result.current.value).toBe('')
    expect(result.current.error).toBeNull()
  })

  it('shows an error and does not touch the cart when the barcode is unknown', async () => {
    ;(window.api.products.getByBarcode as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const { result } = renderHook(() => useBarcodeScan())

    act(() => result.current.setValue('999'))
    await pressEnter(result.current.handleKeyDown)

    await waitFor(() => expect(result.current.error).toBe('Barcode not found: 999'))
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('shows an error for a deactivated product without adding it', async () => {
    ;(window.api.products.getByBarcode as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...coke,
      isActive: false
    })
    const { result } = renderHook(() => useBarcodeScan())

    act(() => result.current.setValue('111'))
    await pressEnter(result.current.handleKeyDown)

    await waitFor(() => expect(result.current.error).toBe('Coke is not available for sale'))
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('shows a stock error when scanning beyond available stock', async () => {
    const scarce = { ...coke, stock: 1 }
    ;(window.api.products.getByBarcode as ReturnType<typeof vi.fn>).mockResolvedValue(scarce)
    const { result } = renderHook(() => useBarcodeScan())

    act(() => result.current.setValue('111'))
    await pressEnter(result.current.handleKeyDown)
    act(() => result.current.setValue('111'))
    await pressEnter(result.current.handleKeyDown)

    await waitFor(() => expect(result.current.error).toBe('Not enough stock for Coke'))
    expect(useCartStore.getState().items[0].quantity).toBe(1)
  })

  it('ignores Enter on an empty field', async () => {
    const { result } = renderHook(() => useBarcodeScan())

    await pressEnter(result.current.handleKeyDown)

    expect(window.api.products.getByBarcode).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `./useBarcodeScan` module not found.

- [ ] **Step 3: Write `useBarcodeScan`**

Create `src/renderer/src/features/cart/useBarcodeScan.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { useCartStore } from './cartStore'

export interface UseBarcodeScanResult {
  inputRef: React.RefObject<HTMLInputElement | null>
  value: string
  setValue: (value: string) => void
  error: string | null
  handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
}

export function useBarcodeScan(): UseBarcodeScanResult {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const addScannedProduct = useCartStore((state) => state.addScannedProduct)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const scan = useCallback(
    async (rawBarcode: string) => {
      const barcode = rawBarcode.trim()
      if (barcode.length === 0) {
        return
      }

      try {
        const product = await window.api.products.getByBarcode(barcode)
        if (!product) {
          setError(`Barcode not found: ${barcode}`)
        } else if (!product.isActive) {
          setError(`${product.name} is not available for sale`)
        } else {
          const result = addScannedProduct(product)
          if (!result.ok) {
            setError(`Not enough stock for ${product.name}`)
          } else {
            setError(null)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }

      setValue('')
      inputRef.current?.focus()
    },
    [addScannedProduct]
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        scan(value)
      }
    },
    [scan, value]
  )

  return { inputRef, value, setValue, error, handleKeyDown }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS (all `useBarcodeScan.test.ts` cases).

- [ ] **Step 5: Write the failing test for `PosPage`**

Create `src/renderer/src/features/cart/PosPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PosPage from './PosPage'
import { useCartStore } from './cartStore'
import type { ProductRecord } from '../../../../shared/product'

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

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Barcode not found: 999'))
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

  it('disables Clear Cart when the cart is empty', () => {
    render(<PosPage />)
    expect(screen.getByRole('button', { name: 'Clear Cart' })).toBeDisabled()
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `./PosPage` module not found.

- [ ] **Step 7: Write `PosPage`**

Create `src/renderer/src/features/cart/PosPage.tsx`:

```tsx
import { useCartStore, cartTotalCents } from './cartStore'
import { useBarcodeScan } from './useBarcodeScan'
import CartTable from './CartTable'
import { Money } from '../../../../shared/money'

function PosPage(): React.JSX.Element {
  const items = useCartStore((state) => state.items)
  const incrementItem = useCartStore((state) => state.incrementItem)
  const decrementItem = useCartStore((state) => state.decrementItem)
  const removeItem = useCartStore((state) => state.removeItem)
  const clear = useCartStore((state) => state.clear)
  const { inputRef, value, setValue, error, handleKeyDown } = useBarcodeScan()

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

      {error && (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      )}

      <div className="products-card">
        <CartTable items={items} onIncrement={incrementItem} onDecrement={decrementItem} onRemove={removeItem} />
      </div>

      <div className="pos-footer">
        <button type="button" className="btn btn-secondary" onClick={clear} disabled={items.length === 0}>
          Clear Cart
        </button>
      </div>
    </div>
  )
}

export default PosPage
```

- [ ] **Step 8: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS (all `PosPage.test.tsx` cases, plus every pre-existing test still passing).

- [ ] **Step 9: Add the app shell / tab nav / scan field / total CSS**

Open `src/renderer/src/assets/main.css`. Find the existing `.products-page` rule:

```css
.products-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: var(--space-5) var(--space-6) var(--space-6);
  gap: var(--space-4);
}
```

Change `height: 100vh;` to `height: 100%;` (it now fills the tab content area below the nav bar, not the whole viewport).

Add at the end of the file:

```css
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app-nav {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-6) 0;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.nav-tab {
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink-muted);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  padding: var(--space-2) var(--space-1) var(--space-3);
  cursor: pointer;
}

.nav-tab:hover {
  color: var(--color-ink);
}

.nav-tab.is-active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.app-content {
  flex: 1;
  min-height: 0;
}

.app-content > * {
  height: 100%;
}

.pos-total {
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-primary);
}

.scan-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 320px;
}

.scan-field label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-ink-muted);
}

.scan-field input {
  padding: 9px var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  font-family: var(--font-mono);
  font-size: 14px;
  background: var(--color-surface);
}

.scan-field input:focus-visible {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-soft);
}

.pos-footer {
  display: flex;
  justify-content: flex-end;
}
```

- [ ] **Step 10: Write the failing test for the app shell**

Create `src/renderer/src/App.test.tsx`:

```tsx
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

- [ ] **Step 11: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `App` still renders only `<ProductsPage />`, so no `Barcode` label exists yet.

- [ ] **Step 12: Write the app shell**

Replace the full contents of `src/renderer/src/App.tsx` with:

```tsx
import { useState } from 'react'
import ProductsPage from './features/products/ProductsPage'
import PosPage from './features/cart/PosPage'

type Tab = 'pos' | 'products'

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
      </nav>
      <div className="app-content">{tab === 'pos' ? <PosPage /> : <ProductsPage />}</div>
    </div>
  )
}

export default App
```

- [ ] **Step 13: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS (all `App.test.tsx` cases, plus every pre-existing test still passing).

- [ ] **Step 14: Verify typecheck, lint, test, and build**

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Expected: all four clean/passing.

- [ ] **Step 15: Manually verify in dev mode**

```bash
npm run seed
npm run dev
```

(Run in the background, wait ~15 seconds, check the terminal output for errors, then stop it — the same best-effort verification approach used since Phase 1, since no GUI inspection is available to an automated agent. Confirm: no crash, no `NODE_MODULE_VERSION` mismatch, no unhandled exception mentioning `products:getByBarcode` or the cart store.)

- [ ] **Step 16: Commit**

```bash
git add src/renderer/src/features/cart/useBarcodeScan.ts src/renderer/src/features/cart/useBarcodeScan.test.ts src/renderer/src/features/cart/PosPage.tsx src/renderer/src/features/cart/PosPage.test.tsx src/renderer/src/App.tsx src/renderer/src/App.test.tsx src/renderer/src/assets/main.css
git commit -m "feat: add barcode scan flow, PosPage, and POS/Products tab shell"
```

---

## Definition of Done for this plan

- [ ] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` all pass (Tasks 1-5).
- [ ] Scanning a known, active, in-stock barcode (Enter after typing) adds it to the cart at quantity 1 with a snapshotted price; scanning the same barcode again increments quantity instead of duplicating the line; the cart total updates correctly using integer-cents math — verified per Task 5 Step 15.
- [ ] Scanning an unknown barcode, a deactivated product's barcode, or attempting to exceed a product's stock all show a clear message and change nothing in the cart (spec §US-07, §US-08).
- [ ] A cashier can adjust a cart line's quantity with +/- buttons (capped at the product's known stock) and remove a line entirely.
- [ ] `src/renderer/**` still has zero imports of `better-sqlite3`/`drizzle-orm` — unchanged from Phase 2, re-confirmed by the existing ESLint rule.
- [ ] Every baht↔cents conversion anywhere in the renderer goes through `Money` — no `Math.round(x * 100)` or `(cents / 100).toFixed(2)` left duplicated outside `src/shared/money.ts`.

## What Phase 3 deliberately does not cover (deferred to later plans)

- **Completing the sale**: writing `sales`/`sale_items`/`stock_transactions` rows, decrementing real database stock, and doing it atomically (Phase 4 — spec §6.3/§11). This plan's cart is entirely client-side/in-memory; nothing here writes to SQLite.
- Receipt printing (spec §10.2, P1 — not tied to a specific roadmap phase).
- Scan-burst/duplicate-scan debounce timeout (spec §10.1 marks this "ควร", recommended rather than required) — the current Enter-triggered flow that clears the field after every scan already avoids the most obvious double-registration failure mode.
- Manual stock adjustment with a recorded reason (still deferred from Phase 2).
- Dashboard/reporting (Phase 5).
- Windows installer packaging and the scaffold placeholder identity fields (still deferred from Phase 1's final review, Phase 6).
