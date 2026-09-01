# POS MVP — Phase 2: Products CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a shop owner add, edit, and search products (barcode, name, price, stock, active/inactive) from the running desktop app — the first real feature UI, built entirely on Phase 1's Electron + SQLite + IPC foundation.

**Architecture:** A product repository (validation + persistence) lives in the main process only, exposed to the renderer through three new IPC channels (`products:list`, `products:create`, `products:update`) behind the same context-bridge boundary Phase 1 established — the renderer still never imports `better-sqlite3`/`drizzle-orm`, and this plan adds an ESLint rule that enforces it mechanically instead of by convention alone. On the renderer side, a `useProducts` data hook wraps the IPC calls, and two presentational components (`ProductList`, `ProductForm`) render the data — no new state library: this feature's state is entirely local to one page, so plain `useState`/props are the right tool per this project's React conventions (Zustand, which the product spec names for later "Cart/UI state," isn't needed here and isn't added).

**Tech Stack:** Same as Phase 1 (Electron, React, TypeScript, Drizzle ORM, better-sqlite3, Vitest) plus `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, and `jsdom` — this plan's first UI feature is also the first renderer code that needs a real component-testing setup, so this plan adds it.

This plan implements **Development Roadmap Phase 2** (spec §15: "Products CRUD + seed data" — exit criteria "เพิ่ม/แก้/ค้นหา product ได้"). Seed data already exists from Phase 1's `scripts/seed.ts`; this plan does not touch it. Phase 3+ (Cart/barcode scan flow, atomic Complete-Sale, Dashboard, packaging) remain separate future plans.

## Global Constraints

From `POS_MVP_Product_Technical_Specification.docx` and Phase 1's established architecture — every task's requirements implicitly include these:

- **The renderer must never touch the SQLite file directly** — all access goes through the main-process repository/IPC boundary (spec §13). This plan makes it mechanically enforced (an ESLint `no-restricted-imports` rule on `src/renderer/**`), not just a convention.
- Barcode must be unique across products (spec §6.1, §8.1) — already a DB-level UNIQUE constraint from Phase 1; this plan must surface a clear, catchable error when violated, not a raw SQLite exception.
- Product name is required — non-empty after trimming (spec §6.1).
- Sell price must be a non-negative number, persisted as an integer number of satang (`price_cents`) — never floating point (spec §6.1, §6.2, §11.1).
- Stock is a non-negative integer in the MVP (spec §6.1).
- Products have an `active`/`inactive` status so a product can stop being sold **without deleting its history** (spec §6.1) — this plan never hard-deletes a product row, only toggles `is_active` via update.
- Search matches by barcode or product name (spec §7.2).
- Suggested tech stack: React + TypeScript + Drizzle ORM — no new state-management library, no backend, no cloud sync at this stage (spec §9, §16, §18 "Over-engineering").

---

## File Structure

```
MyProject/
├── eslint.config.mjs                                    # + renderer/database-boundary rule (Task 3)
├── vitest.config.ts                                      # new — jsdom for renderer tests, node elsewhere (Task 3)
├── src/
│   ├── shared/
│   │   └── product.ts                                    # ProductRecord/CreateProductInput/UpdateProductInput — single source of truth for all 3 processes (Task 1)
│   ├── main/
│   │   ├── index.ts                                      # + registerProductHandlers() call (Task 2); − dead ping listener (Task 5)
│   │   ├── database/
│   │   │   ├── schema.ts                                 # + `export type ProductRow = typeof products.$inferSelect` (Task 1)
│   │   │   └── repositories/
│   │   │       ├── product-repository.ts                 # create/update/search/getById + validation (Task 1)
│   │   │       └── product-repository.test.ts
│   │   └── ipc/
│   │       ├── register-product-handlers.ts               # products:list/create/update (Task 2)
│   │       └── register-product-handlers.test.ts
│   ├── preload/
│   │   ├── index.ts                                       # + api.products.{list,create,update} (Task 2)
│   │   └── index.d.ts                                     # + matching Window.api.products types (Task 2)
│   └── renderer/src/
│       ├── vitest-setup.ts                                 # new — @testing-library/jest-dom/vitest (Task 3)
│       ├── features/products/
│       │   ├── useProducts.ts                              # data hook: list/create/update + search query state (Task 3)
│       │   ├── useProducts.test.ts
│       │   ├── ProductList.tsx                             # presentational table (Task 4)
│       │   ├── ProductList.test.tsx
│       │   ├── ProductForm.tsx                             # presentational add/edit form (Task 4)
│       │   ├── ProductForm.test.tsx
│       │   ├── ProductsPage.tsx                             # composes hook + list + form (Task 5)
│       │   └── ProductsPage.test.tsx
│       ├── App.tsx                                          # scaffold demo content replaced with <ProductsPage /> (Task 5)
│       └── components/Versions.tsx                          # deleted — only used by the removed demo content (Task 5)
```

`src/main/ipc/` is created here for the first time — Phase 1's single `db:health` handler stayed inline in `index.ts`; adding 3 more channels for one feature (with more features still to come) is the point where extracting a dedicated `ipc/` module earns its keep. `src/shared/` is likewise new: Phase 1 didn't need to share a type across all three processes, this plan does (`ProductRecord` is used by the repository, the IPC handler, the preload bridge, and every renderer component) — one file prevents the four of them drifting apart. Both directories were anticipated in Phase 1's original File Structure sketch but not created then; this is the task that actually needs them.

---

### Task 1: Shared product types + product repository (validation + persistence)

**Files:**
- Modify: `src/main/database/schema.ts` (add one line — see Step 3)
- Create: `src/shared/product.ts`
- Create: `src/main/database/repositories/product-repository.ts`
- Test: `src/main/database/repositories/product-repository.test.ts`

**Interfaces:**
- Consumes: `products` table and `DbClient`/`createDbClient` from Phase 1 (`src/main/database/schema.ts`, `src/main/database/client.ts`) — unchanged.
- Produces (all from `src/shared/product.ts` unless noted):
  - `interface ProductRecord { id: string; barcode: string; name: string; priceCents: number; stock: number; isActive: boolean; createdAt: string; updatedAt: string }`
  - `interface CreateProductInput { barcode: string; name: string; priceCents: number; stock: number }`
  - `interface UpdateProductInput { barcode?: string; name?: string; priceCents?: number; stock?: number; isActive?: boolean }`
  - From `src/main/database/repositories/product-repository.ts`: `createProduct(db: BetterSQLite3Database, input: CreateProductInput): ProductRecord`, `updateProduct(db: BetterSQLite3Database, id: string, input: UpdateProductInput): ProductRecord`, `getProductById(db: BetterSQLite3Database, id: string): ProductRecord | undefined`, `searchProducts(db: BetterSQLite3Database, query?: string): ProductRecord[]`, error classes `ProductValidationError`, `DuplicateBarcodeError`, `ProductNotFoundError` (all `extends Error`).

These exact names and signatures are what Task 2's IPC handlers call directly — do not rename anything here without updating Task 2 too.

- [ ] **Step 1: Write the failing test**

Create `src/main/database/repositories/product-repository.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createDbClient, type DbClient } from '../client'
import {
  createProduct,
  updateProduct,
  getProductById,
  searchProducts,
  ProductValidationError,
  DuplicateBarcodeError,
  ProductNotFoundError
} from './product-repository'

describe('product repository', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-product-repo-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('creates a product with the given fields, defaulting to active', () => {
    const product = createProduct(client.db, {
      barcode: '8850001000012',
      name: 'Coca Cola',
      priceCents: 2000,
      stock: 50
    })

    expect(product.id).toBeDefined()
    expect(product.barcode).toBe('8850001000012')
    expect(product.name).toBe('Coca Cola')
    expect(product.priceCents).toBe(2000)
    expect(product.stock).toBe(50)
    expect(product.isActive).toBe(true)
  })

  it('rejects creating a product with a duplicate barcode', () => {
    createProduct(client.db, { barcode: '111', name: 'A', priceCents: 100, stock: 1 })
    expect(() =>
      createProduct(client.db, { barcode: '111', name: 'B', priceCents: 200, stock: 2 })
    ).toThrow(DuplicateBarcodeError)
  })

  it('rejects a product with an empty name', () => {
    expect(() =>
      createProduct(client.db, { barcode: '222', name: '   ', priceCents: 100, stock: 1 })
    ).toThrow(ProductValidationError)
  })

  it('rejects a negative price', () => {
    expect(() =>
      createProduct(client.db, { barcode: '333', name: 'A', priceCents: -100, stock: 1 })
    ).toThrow(ProductValidationError)
  })

  it('rejects a non-integer stock', () => {
    expect(() =>
      createProduct(client.db, { barcode: '444', name: 'A', priceCents: 100, stock: 1.5 })
    ).toThrow(ProductValidationError)
  })

  it('updates a product and changes only the given fields', () => {
    const created = createProduct(client.db, { barcode: '555', name: 'A', priceCents: 100, stock: 1 })
    const updated = updateProduct(client.db, created.id, { priceCents: 150, stock: 10 })

    expect(updated.priceCents).toBe(150)
    expect(updated.stock).toBe(10)
    expect(updated.name).toBe('A')
    expect(updated.barcode).toBe('555')
  })

  it('rejects updating a product to a barcode that already exists on another product', () => {
    createProduct(client.db, { barcode: '666', name: 'A', priceCents: 100, stock: 1 })
    const second = createProduct(client.db, { barcode: '777', name: 'B', priceCents: 100, stock: 1 })

    expect(() => updateProduct(client.db, second.id, { barcode: '666' })).toThrow(DuplicateBarcodeError)
  })

  it('throws ProductNotFoundError when updating a nonexistent product', () => {
    expect(() => updateProduct(client.db, 'does-not-exist', { name: 'X' })).toThrow(ProductNotFoundError)
  })

  it('can deactivate a product without deleting it', () => {
    const created = createProduct(client.db, { barcode: '888', name: 'A', priceCents: 100, stock: 1 })
    const updated = updateProduct(client.db, created.id, { isActive: false })

    expect(updated.isActive).toBe(false)
    expect(getProductById(client.db, created.id)).toBeDefined()
  })

  it('searches products by barcode or name substring', () => {
    createProduct(client.db, { barcode: '8850001000012', name: 'Coca Cola', priceCents: 2000, stock: 50 })
    createProduct(client.db, { barcode: '8850002000013', name: 'Water', priceCents: 1000, stock: 50 })

    const byName = searchProducts(client.db, 'coca')
    expect(byName).toHaveLength(1)
    expect(byName[0].name).toBe('Coca Cola')

    const byBarcode = searchProducts(client.db, '8850002')
    expect(byBarcode).toHaveLength(1)
    expect(byBarcode[0].name).toBe('Water')

    expect(searchProducts(client.db)).toHaveLength(2)
    expect(searchProducts(client.db, 'nonexistent')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `./product-repository` module not found (`src/main/database/repositories/` doesn't exist yet).

- [ ] **Step 3: Add the shared row type export to the schema**

In `src/main/database/schema.ts`, add this line after the existing `products` table definition (do not change anything else in the file):

```ts
export type ProductRow = typeof products.$inferSelect
```

- [ ] **Step 4: Write the shared product types**

Create `src/shared/product.ts`:

```ts
import type { ProductRow } from '../main/database/schema'

export type ProductRecord = ProductRow

export interface CreateProductInput {
  barcode: string
  name: string
  priceCents: number
  stock: number
}

export interface UpdateProductInput {
  barcode?: string
  name?: string
  priceCents?: number
  stock?: number
  isActive?: boolean
}
```

- [ ] **Step 5: Write the repository**

Create `src/main/database/repositories/product-repository.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { eq, like, or } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { products } from '../schema'
import type { ProductRecord, CreateProductInput, UpdateProductInput } from '../../../shared/product'

export class ProductValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProductValidationError'
  }
}

export class DuplicateBarcodeError extends Error {
  constructor(barcode: string) {
    super(`A product with barcode "${barcode}" already exists`)
    this.name = 'DuplicateBarcodeError'
  }
}

export class ProductNotFoundError extends Error {
  constructor(id: string) {
    super(`No product found with id "${id}"`)
    this.name = 'ProductNotFoundError'
  }
}

function validateBarcode(barcode: string): void {
  if (!barcode || barcode.trim().length === 0) {
    throw new ProductValidationError('Barcode is required')
  }
}

function validateName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new ProductValidationError('Product name is required')
  }
}

function validatePriceCents(priceCents: number): void {
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    throw new ProductValidationError('Price must be a non-negative integer number of satang')
  }
}

function validateStock(stock: number): void {
  if (!Number.isInteger(stock) || stock < 0) {
    throw new ProductValidationError('Stock must be a non-negative integer')
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('UNIQUE constraint failed')
}

export function getProductById(db: BetterSQLite3Database, id: string): ProductRecord | undefined {
  return db.select().from(products).where(eq(products.id, id)).get() as ProductRecord | undefined
}

export function createProduct(db: BetterSQLite3Database, input: CreateProductInput): ProductRecord {
  validateBarcode(input.barcode)
  validateName(input.name)
  validatePriceCents(input.priceCents)
  validateStock(input.stock)

  const now = new Date().toISOString()
  const record: ProductRecord = {
    id: randomUUID(),
    barcode: input.barcode.trim(),
    name: input.name.trim(),
    priceCents: input.priceCents,
    stock: input.stock,
    isActive: true,
    createdAt: now,
    updatedAt: now
  }

  try {
    db.insert(products).values(record).run()
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new DuplicateBarcodeError(record.barcode)
    }
    throw err
  }

  return record
}

export function updateProduct(
  db: BetterSQLite3Database,
  id: string,
  input: UpdateProductInput
): ProductRecord {
  const existing = getProductById(db, id)
  if (!existing) {
    throw new ProductNotFoundError(id)
  }

  const next = {
    barcode: input.barcode !== undefined ? input.barcode : existing.barcode,
    name: input.name !== undefined ? input.name : existing.name,
    priceCents: input.priceCents !== undefined ? input.priceCents : existing.priceCents,
    stock: input.stock !== undefined ? input.stock : existing.stock,
    isActive: input.isActive !== undefined ? input.isActive : existing.isActive
  }

  validateBarcode(next.barcode)
  validateName(next.name)
  validatePriceCents(next.priceCents)
  validateStock(next.stock)

  const barcode = next.barcode.trim()
  const name = next.name.trim()
  const updatedAt = new Date().toISOString()

  try {
    db.update(products)
      .set({
        barcode,
        name,
        priceCents: next.priceCents,
        stock: next.stock,
        isActive: next.isActive,
        updatedAt
      })
      .where(eq(products.id, id))
      .run()
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new DuplicateBarcodeError(barcode)
    }
    throw err
  }

  return { ...existing, barcode, name, priceCents: next.priceCents, stock: next.stock, isActive: next.isActive, updatedAt }
}

export function searchProducts(db: BetterSQLite3Database, query?: string): ProductRecord[] {
  if (!query || query.trim().length === 0) {
    return db.select().from(products).all() as ProductRecord[]
  }
  const pattern = `%${query.trim()}%`
  return db
    .select()
    .from(products)
    .where(or(like(products.barcode, pattern), like(products.name, pattern)))
    .all() as ProductRecord[]
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS (all cases in `product-repository.test.ts`, plus every pre-existing Phase 1 test still passing).

- [ ] **Step 7: Commit**

```bash
git add src/main/database/schema.ts src/shared/product.ts src/main/database/repositories/product-repository.ts src/main/database/repositories/product-repository.test.ts
git commit -m "feat: add product repository with validation and shared product types"
```

---

### Task 2: IPC handlers + preload bridge for products

**Files:**
- Create: `src/main/ipc/register-product-handlers.ts`
- Test: `src/main/ipc/register-product-handlers.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

**Interfaces:**
- Consumes: `createProduct`, `updateProduct`, `searchProducts` and `ProductRecord`/`CreateProductInput`/`UpdateProductInput` from Task 1.
- Produces: IPC channels `products:list`, `products:create`, `products:update`; `window.api.products.list(query?: string): Promise<ProductRecord[]>`, `window.api.products.create(input: CreateProductInput): Promise<ProductRecord>`, `window.api.products.update(id: string, input: UpdateProductInput): Promise<ProductRecord>` — these exact three method names/signatures are what Task 3's `useProducts` hook calls.

- [ ] **Step 1: Write the failing test**

Create `src/main/ipc/register-product-handlers.test.ts`:

```ts
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

import { registerProductHandlers } from './register-product-handlers'
import { createDbClient, type DbClient } from '../database/client'

describe('registerProductHandlers', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    handlers.clear()
    dbFile = path.join(os.tmpdir(), `pos-ipc-products-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../drizzle'))
    registerProductHandlers(client.db)
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('registers products:list, products:create, and products:update', () => {
    expect(handlers.has('products:list')).toBe(true)
    expect(handlers.has('products:create')).toBe(true)
    expect(handlers.has('products:update')).toBe(true)
  })

  it('products:create creates a product and products:list returns it', () => {
    const createHandler = handlers.get('products:create')!
    const listHandler = handlers.get('products:list')!

    const created = createHandler({}, { barcode: '999', name: 'Test', priceCents: 100, stock: 5 }) as {
      barcode: string
    }
    expect(created.barcode).toBe('999')

    const list = listHandler({}, undefined) as unknown[]
    expect(list).toHaveLength(1)
  })

  it('products:update updates a product', () => {
    const createHandler = handlers.get('products:create')!
    const updateHandler = handlers.get('products:update')!

    const created = createHandler({}, { barcode: '111', name: 'A', priceCents: 100, stock: 1 }) as {
      id: string
    }
    const updated = updateHandler({}, created.id, { stock: 99 }) as { stock: number }

    expect(updated.stock).toBe(99)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `./register-product-handlers` module not found.

- [ ] **Step 3: Write the IPC handler registration**

Create `src/main/ipc/register-product-handlers.ts`:

```ts
import { ipcMain } from 'electron'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { createProduct, updateProduct, searchProducts } from '../database/repositories/product-repository'
import type { CreateProductInput, ProductRecord, UpdateProductInput } from '../../shared/product'

export function registerProductHandlers(db: BetterSQLite3Database): void {
  ipcMain.handle('products:list', (_event, query?: string): ProductRecord[] => {
    return searchProducts(db, query)
  })

  ipcMain.handle('products:create', (_event, input: CreateProductInput): ProductRecord => {
    return createProduct(db, input)
  })

  ipcMain.handle('products:update', (_event, id: string, input: UpdateProductInput): ProductRecord => {
    return updateProduct(db, id, input)
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS (all cases in `register-product-handlers.test.ts`, plus every pre-existing test still passing).

- [ ] **Step 5: Wire the handler registration into the main process**

Open `src/main/index.ts`. Add to the import block:

```ts
import { registerProductHandlers } from './ipc/register-product-handlers'
```

Inside `app.whenReady().then(async () => { ... })`, immediately after the existing `ipcMain.handle('db:health', ...)` block (which itself comes right after the `try { dbClient = createDbClient(...) } catch { ... }` block) and before `createWindow()`, add:

```ts
registerProductHandlers(dbClient.db)
```

The relevant section of `index.ts` should read, in order: the `try/catch` around `createDbClient`, then `ipcMain.handle('db:health', ...)`, then `registerProductHandlers(dbClient.db)`, then `createWindow()`. Don't reorder or duplicate anything already there.

- [ ] **Step 6: Expose the three methods from the preload script**

Open `src/preload/index.ts`. Add to the imports:

```ts
import type { CreateProductInput, ProductRecord, UpdateProductInput } from '../shared/product'
```

Change the `api` object from:

```ts
const api = {
  dbHealth: (): Promise<{ productCount: number }> => ipcRenderer.invoke('db:health')
}
```

to:

```ts
const api = {
  dbHealth: (): Promise<{ productCount: number }> => ipcRenderer.invoke('db:health'),
  products: {
    list: (query?: string): Promise<ProductRecord[]> => ipcRenderer.invoke('products:list', query),
    create: (input: CreateProductInput): Promise<ProductRecord> =>
      ipcRenderer.invoke('products:create', input),
    update: (id: string, input: UpdateProductInput): Promise<ProductRecord> =>
      ipcRenderer.invoke('products:update', id, input)
  }
}
```

- [ ] **Step 7: Add the matching types to the preload's ambient declarations**

Open `src/preload/index.d.ts`. Add to the imports:

```ts
import type { CreateProductInput, ProductRecord, UpdateProductInput } from '../shared/product'
```

Change the `Window` interface's `api` from:

```ts
    api: {
      dbHealth: () => Promise<{ productCount: number }>
    }
```

to:

```ts
    api: {
      dbHealth: () => Promise<{ productCount: number }>
      products: {
        list: (query?: string) => Promise<ProductRecord[]>
        create: (input: CreateProductInput) => Promise<ProductRecord>
        update: (id: string, input: UpdateProductInput) => Promise<ProductRecord>
      }
    }
```

- [ ] **Step 8: Verify nothing broke**

```bash
npm run typecheck
npm test
```

Expected: both clean/passing.

- [ ] **Step 9: Commit**

```bash
git add src/main/ipc/register-product-handlers.ts src/main/ipc/register-product-handlers.test.ts src/main/index.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat: expose products list/create/update over IPC"
```

---

### Task 3: Renderer test infrastructure + the renderer/database ESLint boundary + `useProducts` hook

**Files:**
- Modify: `package.json` (add devDependencies)
- Modify: `eslint.config.mjs` (renderer/database boundary rule)
- Create: `vitest.config.ts`
- Create: `src/renderer/src/vitest-setup.ts`
- Create: `src/renderer/src/features/products/useProducts.ts`
- Test: `src/renderer/src/features/products/useProducts.test.ts`

**Interfaces:**
- Consumes: `window.api.products.{list,create,update}` from Task 2; `ProductRecord`/`CreateProductInput`/`UpdateProductInput` from `src/shared/product.ts`.
- Produces: `useProducts(): { products: ProductRecord[]; loading: boolean; error: string | null; query: string; setQuery: (query: string) => void; createProduct: (input: CreateProductInput) => Promise<ProductRecord>; updateProduct: (id: string, input: UpdateProductInput) => Promise<ProductRecord> }` — this exact shape is what Task 5's `ProductsPage` consumes.

This task adds the renderer's first component-level test setup — no renderer `.tsx` component exists yet to test (that's Tasks 4-5), but the hook itself is plain TypeScript exercised with React's `renderHook`, which needs the same jsdom environment.

- [ ] **Step 1: Install the testing-library dependencies**

```bash
cd D:\Work\Sandbox\MyProject
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Add the Vitest config**

Create `vitest.config.ts` at the project root:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    environmentMatchGlobs: [['src/renderer/**', 'jsdom']],
    setupFiles: ['src/renderer/src/vitest-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}']
  }
})
```

This keeps every existing `src/main/**` test running under Node (unchanged from Phase 1) and switches only `src/renderer/**` tests to jsdom.

- [ ] **Step 3: Add the renderer test setup file**

Create `src/renderer/src/vitest-setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 4: Verify the existing suite still passes under the new config**

```bash
npm test
```

Expected: PASS — same tests as before (this step doesn't add new tests yet, it just confirms `vitest.config.ts` didn't change which files run or how).

- [ ] **Step 5: Add the ESLint rule enforcing the renderer/database boundary**

Open `eslint.config.mjs`. Add a new config object to the array passed to `defineConfig(...)`, after the existing `{ files: ['**/*.{ts,tsx}'], ... }` block and before `eslintConfigPrettier`:

```js
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'better-sqlite3',
              message: 'The renderer must never touch SQLite directly — call it through window.api instead.'
            },
            {
              name: 'drizzle-orm',
              message: 'The renderer must never touch the database directly — call it through window.api instead.'
            }
          ]
        }
      ]
    }
  },
```

- [ ] **Step 6: Verify lint still passes**

```bash
npm run lint
```

Expected: clean (no renderer file currently imports either package, so the new rule has nothing to flag yet).

- [ ] **Step 7: Write the failing test for the hook**

Create `src/renderer/src/features/products/useProducts.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useProducts } from './useProducts'
import type { ProductRecord } from '../../../../shared/product'

const sampleProduct: ProductRecord = {
  id: '1',
  barcode: '123',
  name: 'Water',
  priceCents: 1000,
  stock: 5,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

describe('useProducts', () => {
  beforeEach(() => {
    window.api = {
      dbHealth: vi.fn(),
      products: {
        list: vi.fn().mockResolvedValue([sampleProduct]),
        create: vi.fn(),
        update: vi.fn()
      }
    } as unknown as Window['api']
  })

  it('loads products on mount', async () => {
    const { result } = renderHook(() => useProducts())

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.products).toEqual([sampleProduct])
    expect(window.api.products.list).toHaveBeenCalledWith(undefined)
  })

  it('re-fetches with the query when setQuery is called', async () => {
    const { result } = renderHook(() => useProducts())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setQuery('water')
    })

    await waitFor(() => expect(window.api.products.list).toHaveBeenLastCalledWith('water'))
  })

  it('surfaces an error message when the list call rejects', async () => {
    ;(window.api.products.list as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useProducts())

    await waitFor(() => expect(result.current.error).toBe('boom'))
  })

  it('createProduct calls the API and reloads the list', async () => {
    const { result } = renderHook(() => useProducts())
    await waitFor(() => expect(result.current.loading).toBe(false))
    ;(window.api.products.create as ReturnType<typeof vi.fn>).mockResolvedValue(sampleProduct)

    await act(async () => {
      await result.current.createProduct({ barcode: '123', name: 'Water', priceCents: 1000, stock: 5 })
    })

    expect(window.api.products.create).toHaveBeenCalledWith({
      barcode: '123',
      name: 'Water',
      priceCents: 1000,
      stock: 5
    })
    expect(window.api.products.list).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 8: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `./useProducts` module not found.

- [ ] **Step 9: Write the hook**

Create `src/renderer/src/features/products/useProducts.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import type { CreateProductInput, ProductRecord, UpdateProductInput } from '../../../../shared/product'

export interface UseProductsResult {
  products: ProductRecord[]
  loading: boolean
  error: string | null
  query: string
  setQuery: (query: string) => void
  createProduct: (input: CreateProductInput) => Promise<ProductRecord>
  updateProduct: (id: string, input: UpdateProductInput) => Promise<ProductRecord>
}

export function useProducts(): UseProductsResult {
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const reload = useCallback(async (currentQuery: string, ignore: { current: boolean }) => {
    setLoading(true)
    try {
      const result = await window.api.products.list(currentQuery || undefined)
      if (!ignore.current) {
        setProducts(result)
        setError(null)
      }
    } catch (err) {
      if (!ignore.current) {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      if (!ignore.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const ignore = { current: false }
    reload(query, ignore)
    return () => {
      ignore.current = true
    }
  }, [query, reload])

  const createProduct = useCallback(
    async (input: CreateProductInput): Promise<ProductRecord> => {
      const created = await window.api.products.create(input)
      await reload(query, { current: false })
      return created
    },
    [query, reload]
  )

  const updateProduct = useCallback(
    async (id: string, input: UpdateProductInput): Promise<ProductRecord> => {
      const updated = await window.api.products.update(id, input)
      await reload(query, { current: false })
      return updated
    },
    [query, reload]
  )

  return { products, loading, error, query, setQuery, createProduct, updateProduct }
}
```

- [ ] **Step 10: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS (all cases in `useProducts.test.ts`, plus every pre-existing test still passing).

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json eslint.config.mjs vitest.config.ts src/renderer/src/vitest-setup.ts src/renderer/src/features/products/useProducts.ts src/renderer/src/features/products/useProducts.test.ts
git commit -m "feat: add renderer test infra, renderer/database ESLint boundary, and useProducts hook"
```

---

### Task 4: `ProductList` and `ProductForm` presentational components

**Files:**
- Create: `src/renderer/src/features/products/ProductList.tsx`
- Test: `src/renderer/src/features/products/ProductList.test.tsx`
- Create: `src/renderer/src/features/products/ProductForm.tsx`
- Test: `src/renderer/src/features/products/ProductForm.test.tsx`

**Interfaces:**
- Consumes: `ProductRecord`/`CreateProductInput`/`UpdateProductInput` from `src/shared/product.ts`. Nothing from `useProducts` directly — both components are purely presentational, receiving data and callbacks as props (per this project's React conventions: keep visual pieces free of data-fetching logic so they're trivial to test and reuse).
- Produces:
  - `<ProductList products={ProductRecord[]} onEdit={(product: ProductRecord) => void} />`
  - `<ProductForm initialValues={ProductRecord | undefined} submitting={boolean} error={string | null} onSubmit={(input: CreateProductInput | UpdateProductInput) => void} onCancel={() => void} />`

These exact prop shapes are what Task 5's `ProductsPage` renders.

- [ ] **Step 1: Write the failing test for `ProductList`**

Create `src/renderer/src/features/products/ProductList.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProductList from './ProductList'
import type { ProductRecord } from '../../../../shared/product'

const products: ProductRecord[] = [
  {
    id: '1',
    barcode: '8850001000012',
    name: 'Coca Cola',
    priceCents: 2000,
    stock: 50,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: '2',
    barcode: '8850002000013',
    name: 'Water',
    priceCents: 1000,
    stock: 0,
    isActive: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
]

describe('ProductList', () => {
  it('renders a row per product with formatted price and status', () => {
    render(<ProductList products={products} onEdit={vi.fn()} />)

    expect(screen.getByText('Coca Cola')).toBeInTheDocument()
    expect(screen.getByText('฿20.00')).toBeInTheDocument()
    expect(screen.getByText('Water')).toBeInTheDocument()
    expect(screen.getByText('฿10.00')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()
  })

  it('shows an empty state when there are no products', () => {
    render(<ProductList products={[]} onEdit={vi.fn()} />)
    expect(screen.getByText('No products found.')).toBeInTheDocument()
  })

  it('calls onEdit with the product when its Edit button is clicked', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(<ProductList products={products} onEdit={onEdit} />)

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    expect(onEdit).toHaveBeenCalledWith(products[0])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `./ProductList` module not found.

- [ ] **Step 3: Write `ProductList`**

Create `src/renderer/src/features/products/ProductList.tsx`:

```tsx
import type { ProductRecord } from '../../../../shared/product'

export interface ProductListProps {
  products: ProductRecord[]
  onEdit: (product: ProductRecord) => void
}

function formatBaht(cents: number): string {
  return `฿${(cents / 100).toFixed(2)}`
}

function ProductList({ products, onEdit }: ProductListProps): React.JSX.Element {
  if (products.length === 0) {
    return <p>No products found.</p>
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Barcode</th>
          <th>Name</th>
          <th>Price</th>
          <th>Stock</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {products.map((product) => (
          <tr key={product.id}>
            <td>{product.barcode}</td>
            <td>{product.name}</td>
            <td>{formatBaht(product.priceCents)}</td>
            <td>{product.stock}</td>
            <td>{product.isActive ? 'Active' : 'Inactive'}</td>
            <td>
              <button type="button" onClick={() => onEdit(product)}>
                Edit
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default ProductList
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS (all `ProductList.test.tsx` cases).

- [ ] **Step 5: Write the failing test for `ProductForm`**

Create `src/renderer/src/features/products/ProductForm.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProductForm from './ProductForm'
import type { ProductRecord } from '../../../../shared/product'

describe('ProductForm', () => {
  it('submits a valid new product with price converted to integer cents', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ProductForm submitting={false} error={null} onSubmit={onSubmit} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText('Barcode'), '8850001000012')
    await user.type(screen.getByLabelText('Name'), 'Coca Cola')
    await user.type(screen.getByLabelText('Price (Baht)'), '20.50')
    await user.type(screen.getByLabelText('Stock'), '10')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onSubmit).toHaveBeenCalledWith({
      barcode: '8850001000012',
      name: 'Coca Cola',
      priceCents: 2050,
      stock: 10
    })
  })

  it('rejects submission with an empty name', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ProductForm submitting={false} error={null} onSubmit={onSubmit} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText('Barcode'), '123')
    await user.type(screen.getByLabelText('Price (Baht)'), '5')
    await user.type(screen.getByLabelText('Stock'), '1')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Product name is required')
  })

  it('rejects a negative price', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ProductForm submitting={false} error={null} onSubmit={onSubmit} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText('Barcode'), '123')
    await user.type(screen.getByLabelText('Name'), 'A')
    await user.type(screen.getByLabelText('Price (Baht)'), '-5')
    await user.type(screen.getByLabelText('Stock'), '1')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Price must be a non-negative number')
  })

  it('pre-fills fields and includes isActive when editing an existing product', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const existing: ProductRecord = {
      id: '1',
      barcode: '999',
      name: 'Chips',
      priceCents: 3500,
      stock: 20,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }

    render(
      <ProductForm initialValues={existing} submitting={false} error={null} onSubmit={onSubmit} onCancel={vi.fn()} />
    )

    expect(screen.getByLabelText('Barcode')).toHaveValue('999')
    expect(screen.getByLabelText('Name')).toHaveValue('Chips')

    await user.click(screen.getByLabelText('Active'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSubmit).toHaveBeenCalledWith({
      barcode: '999',
      name: 'Chips',
      priceCents: 3500,
      stock: 20,
      isActive: false
    })
  })

  it('shows a server-provided error when there is no local validation error', () => {
    render(
      <ProductForm
        submitting={false}
        error='A product with barcode "999" already exists'
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('already exists')
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `./ProductForm` module not found.

- [ ] **Step 7: Write `ProductForm`**

Create `src/renderer/src/features/products/ProductForm.tsx`:

```tsx
import { useState } from 'react'
import type { CreateProductInput, ProductRecord, UpdateProductInput } from '../../../../shared/product'

export interface ProductFormProps {
  initialValues?: ProductRecord
  submitting: boolean
  error: string | null
  onSubmit: (input: CreateProductInput | UpdateProductInput) => void
  onCancel: () => void
}

function ProductForm({
  initialValues,
  submitting,
  error,
  onSubmit,
  onCancel
}: ProductFormProps): React.JSX.Element {
  const [barcode, setBarcode] = useState(initialValues?.barcode ?? '')
  const [name, setName] = useState(initialValues?.name ?? '')
  const [priceBaht, setPriceBaht] = useState(initialValues ? (initialValues.priceCents / 100).toString() : '')
  const [stock, setStock] = useState(initialValues ? initialValues.stock.toString() : '')
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true)
  const [formError, setFormError] = useState<string | null>(null)

  const isEditing = initialValues !== undefined

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault()

    if (barcode.trim().length === 0) {
      setFormError('Barcode is required')
      return
    }
    if (name.trim().length === 0) {
      setFormError('Product name is required')
      return
    }
    const priceCents = Math.round(Number(priceBaht) * 100)
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      setFormError('Price must be a non-negative number')
      return
    }
    const stockValue = Number(stock)
    if (!Number.isInteger(stockValue) || stockValue < 0) {
      setFormError('Stock must be a non-negative whole number')
      return
    }

    setFormError(null)
    if (isEditing) {
      onSubmit({ barcode: barcode.trim(), name: name.trim(), priceCents, stock: stockValue, isActive })
    } else {
      onSubmit({ barcode: barcode.trim(), name: name.trim(), priceCents, stock: stockValue })
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>{isEditing ? 'Edit Product' : 'Add Product'}</h2>

      <label htmlFor="product-barcode">Barcode</label>
      <input
        id="product-barcode"
        value={barcode}
        onChange={(e) => setBarcode(e.target.value)}
        disabled={submitting}
      />

      <label htmlFor="product-name">Name</label>
      <input id="product-name" value={name} onChange={(e) => setName(e.target.value)} disabled={submitting} />

      <label htmlFor="product-price">Price (Baht)</label>
      <input
        id="product-price"
        type="number"
        step="0.01"
        min="0"
        value={priceBaht}
        onChange={(e) => setPriceBaht(e.target.value)}
        disabled={submitting}
      />

      <label htmlFor="product-stock">Stock</label>
      <input
        id="product-stock"
        type="number"
        step="1"
        min="0"
        value={stock}
        onChange={(e) => setStock(e.target.value)}
        disabled={submitting}
      />

      {isEditing && (
        <label htmlFor="product-active">
          <input
            id="product-active"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            disabled={submitting}
          />
          Active
        </label>
      )}

      {(formError || error) && <p role="alert">{formError ?? error}</p>}

      <button type="submit" disabled={submitting}>
        {isEditing ? 'Save' : 'Add'}
      </button>
      <button type="button" onClick={onCancel} disabled={submitting}>
        Cancel
      </button>
    </form>
  )
}

export default ProductForm
```

- [ ] **Step 8: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS (all `ProductForm.test.tsx` cases, plus every pre-existing test still passing).

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/features/products/ProductList.tsx src/renderer/src/features/products/ProductList.test.tsx src/renderer/src/features/products/ProductForm.tsx src/renderer/src/features/products/ProductForm.test.tsx
git commit -m "feat: add ProductList and ProductForm presentational components"
```

---

### Task 5: `ProductsPage` + wire into the app shell

**Files:**
- Create: `src/renderer/src/features/products/ProductsPage.tsx`
- Test: `src/renderer/src/features/products/ProductsPage.test.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/main/index.ts` (remove the now-dead `ping` listener — see Step 6)
- Delete: `src/renderer/src/components/Versions.tsx`

**Interfaces:**
- Consumes: `useProducts` (Task 3), `ProductList`/`ProductForm` (Task 4).
- Produces: `<ProductsPage />` — a fully self-contained page component with no props, rendered by `App.tsx`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/features/products/ProductsPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProductsPage from './ProductsPage'
import type { ProductRecord } from '../../../../shared/product'

const existing: ProductRecord = {
  id: '1',
  barcode: '111',
  name: 'Water',
  priceCents: 1000,
  stock: 5,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

describe('ProductsPage', () => {
  beforeEach(() => {
    window.api = {
      dbHealth: vi.fn(),
      products: {
        list: vi.fn().mockResolvedValue([existing]),
        create: vi.fn(),
        update: vi.fn()
      }
    } as unknown as Window['api']
  })

  it('shows the product list once loaded', async () => {
    render(<ProductsPage />)

    await waitFor(() => expect(screen.getByText('Water')).toBeInTheDocument())
  })

  it('creates a new product through the Add Product form', async () => {
    const user = userEvent.setup()
    const created: ProductRecord = { ...existing, id: '2', barcode: '222', name: 'Chips' }
    ;(window.api.products.create as ReturnType<typeof vi.fn>).mockResolvedValue(created)

    render(<ProductsPage />)
    await waitFor(() => expect(screen.getByText('Water')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Add Product' }))
    await user.type(screen.getByLabelText('Barcode'), '222')
    await user.type(screen.getByLabelText('Name'), 'Chips')
    await user.type(screen.getByLabelText('Price (Baht)'), '35')
    await user.type(screen.getByLabelText('Stock'), '20')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(window.api.products.create).toHaveBeenCalledWith({
        barcode: '222',
        name: 'Chips',
        priceCents: 3500,
        stock: 20
      })
    )
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('edits an existing product by clicking Edit and saving changes', async () => {
    const user = userEvent.setup()
    ;(window.api.products.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, stock: 99 })

    render(<ProductsPage />)
    await waitFor(() => expect(screen.getByText('Water')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const stockInput = screen.getByLabelText('Stock')
    await user.clear(stockInput)
    await user.type(stockInput, '99')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(window.api.products.update).toHaveBeenCalledWith('1', {
        barcode: '111',
        name: 'Water',
        priceCents: 1000,
        stock: 99,
        isActive: true
      })
    )
  })

  it('filters via the search box, which re-queries window.api.products.list', async () => {
    const user = userEvent.setup()
    render(<ProductsPage />)
    await waitFor(() => expect(screen.getByText('Water')).toBeInTheDocument())

    await user.type(screen.getByLabelText('Search products'), 'wat')

    await waitFor(() => expect(window.api.products.list).toHaveBeenLastCalledWith('wat'))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `./ProductsPage` module not found.

- [ ] **Step 3: Write `ProductsPage`**

Create `src/renderer/src/features/products/ProductsPage.tsx`:

```tsx
import { useState } from 'react'
import { useProducts } from './useProducts'
import ProductList from './ProductList'
import ProductForm from './ProductForm'
import type { CreateProductInput, ProductRecord, UpdateProductInput } from '../../../../shared/product'

function ProductsPage(): React.JSX.Element {
  const { products, loading, error, query, setQuery, createProduct, updateProduct } = useProducts()
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function handleAddClick(): void {
    setEditingProduct(null)
    setFormError(null)
    setShowForm(true)
  }

  function handleEdit(product: ProductRecord): void {
    setEditingProduct(product)
    setFormError(null)
    setShowForm(true)
  }

  function handleCancel(): void {
    setShowForm(false)
  }

  async function handleSubmit(input: CreateProductInput | UpdateProductInput): Promise<void> {
    setSubmitting(true)
    setFormError(null)
    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, input as UpdateProductInput)
      } else {
        await createProduct(input as CreateProductInput)
      }
      setShowForm(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <h1>Products</h1>

      <input
        aria-label="Search products"
        placeholder="Search by barcode or name"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <button type="button" onClick={handleAddClick}>
        Add Product
      </button>

      {loading && <p>Loading products...</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && <ProductList products={products} onEdit={handleEdit} />}

      {showForm && (
        <ProductForm
          initialValues={editingProduct ?? undefined}
          submitting={submitting}
          error={formError}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      )}
    </div>
  )
}

export default ProductsPage
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS (all `ProductsPage.test.tsx` cases, plus every pre-existing test still passing).

- [ ] **Step 5: Replace the scaffold demo content in `App.tsx`**

Replace the full contents of `src/renderer/src/App.tsx` with:

```tsx
import ProductsPage from './features/products/ProductsPage'

function App(): React.JSX.Element {
  return <ProductsPage />
}

export default App
```

This removes the Phase 1 `dbStatus`/`dbHealth` status line along with the scaffold's logo/tip/"Send IPC"/`Versions` demo content — Phase 1's `db:health` IPC channel and its main-process handler are untouched (still registered in `index.ts`, still safe to call), only its one-line renderer display is being replaced by the real Products feature it was standing in for.

- [ ] **Step 6: Remove the now-dead `ping` IPC listener**

The scaffold's "Send IPC" button (just deleted) was the only caller of `window.electron.ipcRenderer.send('ping')`. Open `src/main/index.ts` and remove this now-unreachable line from inside `app.whenReady().then(async () => { ... })`:

```ts
  // IPC test
  ipcMain.on('ping', () => console.log('pong'))
```

Don't remove anything else around it — the `try/catch` DB init block, `db:health` handler, and `registerProductHandlers(dbClient.db)` call stay exactly as they are.

- [ ] **Step 7: Delete the now-unused `Versions` component**

```bash
git rm src/renderer/src/components/Versions.tsx
```

(It was only ever imported by the demo content just removed from `App.tsx`.)

- [ ] **Step 8: Verify the full suite, typecheck, lint, and build**

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Expected: all four clean/passing.

- [ ] **Step 9: Manually verify the app in dev mode**

```bash
npm run seed
npm run dev
```

(Run in the background, wait ~15 seconds, check the terminal output for errors, then stop it — the same best-effort verification approach Phase 1's Task 4 used, since no GUI inspection is available to an automated agent. Confirm: no crash, no `NODE_MODULE_VERSION` mismatch, no unhandled exception mentioning `products:list`/`products:create`/`products:update`.)

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/features/products/ProductsPage.tsx src/renderer/src/features/products/ProductsPage.test.tsx src/renderer/src/App.tsx src/main/index.ts
git rm src/renderer/src/components/Versions.tsx
git commit -m "feat: wire ProductsPage into the app shell, remove scaffold demo content"
```

---

## Definition of Done for this plan

- [ ] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` all pass (Tasks 1-5).
- [ ] A shop owner can add a product, see it in the list, search for it by barcode or name, edit it, and deactivate it without deleting its history — all via the running app, verified per Task 5 Step 9.
- [ ] `src/renderer/**` has zero imports of `better-sqlite3` or `drizzle-orm`, both by convention (Phase 1) and now mechanically enforced by an ESLint rule (Task 3).
- [ ] Duplicate barcodes are rejected with a clear message surfaced in the form, not a raw SQLite error (Tasks 1, 4).
- [ ] Money stays integer `price_cents` end to end — the only place a float (`priceBaht`) exists is the form's own display/input conversion in `ProductForm.tsx`, converted to integer cents before ever leaving the component (Task 4).

## What Phase 2 deliberately does not cover (deferred to later plans)

- Exact single-barcode lookup for the live barcode-scanner flow (Phase 3 — `searchProducts`'s `LIKE` match is for the Products screen's search box, not the POS scan path, which needs a different, exact-match repository function).
- Cart, `Money` value object, pricing/line-total logic (Phase 3 — spec §6.2/§11.1).
- Atomic Complete-Sale transaction, stock decrement, `stock_transactions` ledger writes (Phase 4 — spec §6.3/§11).
- Dashboard/reporting queries (Phase 5 — spec §12).
- Windows installer packaging, and the scaffold placeholder identity fields (`package.json` name/author/homepage, `electron-builder.yml` appId/productName) deferred from Phase 1's final review (Phase 6).
- Manual stock adjustment with a recorded reason (spec §7.2 marks this "optional ใน MVP") — not built here; Products CRUD covers add/edit/search only.
