# Phase 7: Product Enrichment (Categories + Images) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add product categories (full CRUD) and product images (local upload, stored by the app itself) to the existing Products screen, per `docs/superpowers/specs/2026-09-05-pos-enhancements-design.md`.

**Architecture:** A new `categories` table and two new nullable columns on `products` (`category_id`, `image_path`). Categories get their own repository/IPC/hook, mirroring the existing product-repository pattern exactly. Images are never referenced from their original disk location: a native file picker (Electron's `dialog.showOpenDialog`) returns a source path, which gets copied into the app's own `userData/product-images/` folder under a fresh UUID filename — the DB only ever stores that filename. Displaying a stored image goes through a custom `app-image://` protocol registered in the main process (the standard, efficient Electron pattern for serving local files to a renderer without a base64 round-trip on every list render); a freshly-picked-but-not-yet-saved image is previewed via a one-time base64 data URL instead, since it isn't in the images folder yet.

**Tech Stack:** Same as the rest of the app — Electron main process, Drizzle ORM/better-sqlite3, React 19 renderer, Vitest + React Testing Library. No new dependencies.

## Global Constraints

- Every write path gets a test in the same task; assert real outcomes against a real SQLite DB or real rendered DOM — no "it didn't throw" tests.
- The renderer never imports `better-sqlite3`/`drizzle-orm`/`electron`'s `dialog`/`fs`, or anything under `src/main/**` — everything crosses `window.api`.
- `src/shared/**` must not import from `src/main/**`.
- IPC "not found" convention: a repository function returns `undefined` for "not found," never throws for a missing lookup, never returns `null` — the IPC handler converts `undefined` to `null` with `?? null` before it crosses to the renderer (matching `products:getByBarcode`).
- Domain errors are named classes extending `Error` with a `.name` override (matching `ProductValidationError`, `DuplicateBarcodeError`, etc. in `product-repository.ts`) — never a bare `throw new Error(...)` for an expected validation/business-rule failure.
- Money is always an integer number of satang through `Money` — not touched by this phase, called out only because it binds every phase.
- **Product images are never read from, or left dependent on, their original picked location.** They are copied into this app's own storage the moment they're accepted (on save, not on pick) and referenced afterward only by a filename the app itself generated — never an absolute path from the user's filesystem.
- **A category cannot be deleted while any product is still assigned to it.** No cascade, no silent reassignment to "uncategorized" — the shop owner must move or clear those products' category first.

## File Structure

- Modify: `src/main/database/schema.ts` — new `categories` table; `products` gains `categoryId`, `imagePath`.
- Create (generated): a new `drizzle/*.sql` migration.
- Create: `src/shared/category.ts` — `CategoryRecord`.
- Modify: `src/shared/product.ts` — `ProductRecord`/`CreateProductInput`/`UpdateProductInput` gain the new fields.
- Create: `src/main/database/repositories/category-repository.ts` (+ test)
- Create: `src/main/ipc/register-category-handlers.ts` (+ test)
- Create: `src/main/storage/product-images.ts` (+ test) — `storeProductImage`, `deleteProductImage`.
- Create: `src/main/ipc/register-image-handlers.ts` — the file-picker IPC handler.
- Modify: `src/main/index.ts` — register the custom `app-image://` protocol, register the two new handler groups.
- Modify: `src/main/database/repositories/product-repository.ts` (+ test) — accept/persist `categoryId`/`imageSourcePath`/`clearImage`.
- Modify: `src/main/ipc/register-product-handlers.ts`, `src/preload/index.ts`, `src/preload/index.d.ts` — thread the new fields and channels through.
- Create: `src/renderer/src/features/categories/useCategories.ts` (+ test)
- Create: `src/renderer/src/features/categories/CategoryManager.tsx` (+ test) — the "Manage Categories" modal.
- Modify: `src/renderer/src/features/products/ProductForm.tsx` (+ test) — category `<select>`, image picker/preview.
- Modify: `src/renderer/src/features/products/ProductList.tsx` (+ test) — image thumbnail column, category column.
- Modify: `src/renderer/src/features/products/ProductsPage.tsx` (+ test) — category filter dropdown, "Manage Categories" button.
- Modify: `src/renderer/src/assets/main.css` — thumbnail, category-manager, and image-picker styles.

---

### Task 1: Schema, migration, and shared types

**Files:**
- Modify: `src/main/database/schema.ts`
- Create (generated): a new `drizzle/*.sql` migration
- Create: `src/shared/category.ts`
- Modify: `src/shared/product.ts`

**Interfaces:**
- Produces: `export const categories` (Drizzle table) and `export type CategoryRow = typeof categories.$inferSelect` in `schema.ts`; `products.categoryId`/`products.imagePath` columns; `src/shared/category.ts`'s `interface CategoryRecord { id: string; name: string; createdAt: string; updatedAt: string }`; `src/shared/product.ts`'s extended `ProductRecord { ...; categoryId: string | null; imagePath: string | null }`, `CreateProductInput { ...; categoryId?: string | null; imageSourcePath?: string | null }`, `UpdateProductInput { ...; categoryId?: string | null; imageSourcePath?: string | null; clearImage?: boolean }` — every later task in this plan imports these exact shapes.

- [ ] **Step 1: Add the `categories` table and extend `products` in `schema.ts`**

Add `categories`, right before the existing `export const products = ...`:

```typescript
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export type CategoryRow = typeof categories.$inferSelect
```

Change the existing `products` table definition from:

```typescript
export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  barcode: text('barcode').notNull().unique(),
  name: text('name').notNull(),
  priceCents: integer('price_cents').notNull(),
  stock: integer('stock').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})
```

to:

```typescript
export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  barcode: text('barcode').notNull().unique(),
  name: text('name').notNull(),
  priceCents: integer('price_cents').notNull(),
  stock: integer('stock').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  categoryId: text('category_id').references(() => categories.id),
  imagePath: text('image_path'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})
```

(`categories` must be declared before `products` in the file, since `products.categoryId` references it — matching how `sales` is already declared before `saleItems`, which references `sales.id`.)

The existing compile-time drift-guard block (`AssertProductRowMatchesContract`, right after `products`) stays exactly where it is — it will now correctly fail to typecheck until `ProductRecord` (Step 3 below) is updated to match, which is the point of that guard.

- [ ] **Step 2: Generate and verify the migration**

Run: `npm run db:generate`
Expected: a new file appears under `drizzle/`. Open it and confirm it contains exactly: `CREATE TABLE categories (...)` and an `ALTER TABLE products ADD COLUMN category_id ...` / `ALTER TABLE products ADD COLUMN image_path ...` (or an equivalent table-rebuild SQLite uses for adding a column with a foreign key — drizzle-kit may choose either strategy; either is fine as long as no unrelated table is touched). If it contains anything else, stop and report rather than committing an unexpected migration.

- [ ] **Step 3: Add `CategoryRecord` and extend the product shared types**

```typescript
// src/shared/category.ts
export interface CategoryRecord {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}
```

In `src/shared/product.ts`, change:

```typescript
export interface ProductRecord {
  id: string
  barcode: string
  name: string
  priceCents: number
  stock: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

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

to:

```typescript
export interface ProductRecord {
  id: string
  barcode: string
  name: string
  priceCents: number
  stock: number
  isActive: boolean
  categoryId: string | null
  imagePath: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateProductInput {
  barcode: string
  name: string
  priceCents: number
  stock: number
  categoryId?: string | null
  imageSourcePath?: string | null
}

export interface UpdateProductInput {
  barcode?: string
  name?: string
  priceCents?: number
  stock?: number
  isActive?: boolean
  categoryId?: string | null
  imageSourcePath?: string | null
  clearImage?: boolean
}
```

`imageSourcePath` is the absolute path of a freshly-picked file on the user's machine (not yet stored by this app); `clearImage: true` on update means "remove the current image, no replacement" — distinct from omitting the field entirely (which means "leave the image as it is").

- [ ] **Step 4: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: FAIL at typecheck — `product-repository.ts` builds a `ProductRecord` object literal that's now missing `categoryId`/`imagePath`, and the compile-time drift guard (`AssertProductRowMatchesContract`) will also fail since `ProductRow` (inferred from the new schema) and `ProductRecord` no longer match. This is expected; Task 6 fixes `product-repository.ts`. Confirm the failure is exactly this (missing fields), not something else, then proceed — later tasks in this plan resolve it.

- [ ] **Step 5: Commit**

```bash
git add src/main/database/schema.ts drizzle/ src/shared/category.ts src/shared/product.ts
git commit -m "feat: add categories table and product category/image columns"
```

---

### Task 2: Category repository

**Files:**
- Create: `src/main/database/repositories/category-repository.ts`
- Test: `src/main/database/repositories/category-repository.test.ts`

**Interfaces:**
- Consumes: `categories`, `products` tables from `../schema`; `CategoryRecord` from `../../../shared/category`.
- Produces: `function listCategories(db): CategoryRecord[]`, `function createCategory(db, name: string): CategoryRecord`, `function updateCategory(db, id: string, name: string): CategoryRecord`, `function deleteCategory(db, id: string): void`, `class CategoryValidationError`, `class DuplicateCategoryNameError`, `class CategoryNotFoundError`, `class CategoryInUseError` — for Task 3 (IPC) and Task 6 (product repository's categoryId validation) to import.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/main/database/repositories/category-repository.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createDbClient, type DbClient } from '../client'
import { createProduct } from './product-repository'
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  CategoryValidationError,
  DuplicateCategoryNameError,
  CategoryNotFoundError,
  CategoryInUseError
} from './category-repository'

describe('category repository', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-category-repo-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('creates a category', () => {
    const category = createCategory(client.db, 'Beverages')
    expect(category.id).toBeDefined()
    expect(category.name).toBe('Beverages')
  })

  it('rejects an empty name', () => {
    expect(() => createCategory(client.db, '   ')).toThrow(CategoryValidationError)
  })

  it('rejects a duplicate name', () => {
    createCategory(client.db, 'Snacks')
    expect(() => createCategory(client.db, 'Snacks')).toThrow(DuplicateCategoryNameError)
  })

  it('lists categories', () => {
    createCategory(client.db, 'Beverages')
    createCategory(client.db, 'Snacks')
    expect(listCategories(client.db)).toHaveLength(2)
  })

  it('updates a category name', () => {
    const category = createCategory(client.db, 'Beverages')
    const updated = updateCategory(client.db, category.id, 'Drinks')
    expect(updated.name).toBe('Drinks')
  })

  it('rejects renaming a category to a name that already exists', () => {
    createCategory(client.db, 'Beverages')
    const second = createCategory(client.db, 'Snacks')
    expect(() => updateCategory(client.db, second.id, 'Beverages')).toThrow(DuplicateCategoryNameError)
  })

  it('throws CategoryNotFoundError when updating a nonexistent category', () => {
    expect(() => updateCategory(client.db, 'does-not-exist', 'X')).toThrow(CategoryNotFoundError)
  })

  it('deletes a category that has no products assigned', () => {
    const category = createCategory(client.db, 'Beverages')
    deleteCategory(client.db, category.id)
    expect(listCategories(client.db)).toHaveLength(0)
  })

  it('rejects deleting a category that still has products assigned', () => {
    const category = createCategory(client.db, 'Beverages')
    createProduct(client.db, {
      barcode: '111',
      name: 'Coke',
      priceCents: 2000,
      stock: 10,
      categoryId: category.id
    })
    expect(() => deleteCategory(client.db, category.id)).toThrow(CategoryInUseError)
    expect(listCategories(client.db)).toHaveLength(1)
  })

  it('throws CategoryNotFoundError when deleting a nonexistent category', () => {
    expect(() => deleteCategory(client.db, 'does-not-exist')).toThrow(CategoryNotFoundError)
  })
})
```

Note: this test file's product-with-category test passes `categoryId` to `createProduct` — that parameter doesn't exist yet (Task 6 adds it). This one test will fail for a different reason than "CategoryInUseError not thrown" until Task 6 lands; that's expected and fine — every other test in this file is fully self-contained and should pass once this task's own implementation exists.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- category-repository`
Expected: FAIL — `category-repository.ts` does not exist yet.

- [ ] **Step 3: Implement the category repository**

```typescript
// src/main/database/repositories/category-repository.ts
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { categories, products } from '../schema'
import type { CategoryRecord } from '../../../shared/category'

export class CategoryValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CategoryValidationError'
  }
}

export class DuplicateCategoryNameError extends Error {
  constructor(name: string) {
    super(`A category named "${name}" already exists`)
    this.name = 'DuplicateCategoryNameError'
  }
}

export class CategoryNotFoundError extends Error {
  constructor(id: string) {
    super(`No category found with id "${id}"`)
    this.name = 'CategoryNotFoundError'
  }
}

export class CategoryInUseError extends Error {
  constructor(name: string, productCount: number) {
    super(`Cannot delete "${name}": ${productCount} product(s) are still assigned to it`)
    this.name = 'CategoryInUseError'
  }
}

function validateName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new CategoryValidationError('Category name is required')
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('UNIQUE constraint failed')
}

export function listCategories(db: BetterSQLite3Database): CategoryRecord[] {
  return db.select().from(categories).all() as CategoryRecord[]
}

export function createCategory(db: BetterSQLite3Database, name: string): CategoryRecord {
  validateName(name)
  const now = new Date().toISOString()
  const record: CategoryRecord = {
    id: randomUUID(),
    name: name.trim(),
    createdAt: now,
    updatedAt: now
  }
  try {
    db.insert(categories).values(record).run()
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new DuplicateCategoryNameError(record.name)
    }
    throw err
  }
  return record
}

export function updateCategory(
  db: BetterSQLite3Database,
  id: string,
  name: string
): CategoryRecord {
  const existing = db.select().from(categories).where(eq(categories.id, id)).get()
  if (!existing) {
    throw new CategoryNotFoundError(id)
  }
  validateName(name)
  const trimmedName = name.trim()
  const updatedAt = new Date().toISOString()
  try {
    db.update(categories).set({ name: trimmedName, updatedAt }).where(eq(categories.id, id)).run()
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new DuplicateCategoryNameError(trimmedName)
    }
    throw err
  }
  return { ...existing, name: trimmedName, updatedAt } as CategoryRecord
}

export function deleteCategory(db: BetterSQLite3Database, id: string): void {
  const existing = db.select().from(categories).where(eq(categories.id, id)).get()
  if (!existing) {
    throw new CategoryNotFoundError(id)
  }
  const assignedProducts = db.select().from(products).where(eq(products.categoryId, id)).all()
  if (assignedProducts.length > 0) {
    throw new CategoryInUseError(existing.name, assignedProducts.length)
  }
  db.delete(categories).where(eq(categories.id, id)).run()
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- category-repository`
Expected: all tests pass except the one that also calls `createProduct(..., { categoryId })` (fails with a TypeScript error at the call site until Task 6, or an ignored extra property at runtime if TS doesn't catch it in this isolated run — either way, it's expected to be the one red test right now; every other test in the file passes).

- [ ] **Step 5: Commit**

```bash
git add src/main/database/repositories/category-repository.ts src/main/database/repositories/category-repository.test.ts
git commit -m "feat: add category repository (CRUD + in-use delete guard)"
```

---

### Task 3: Category IPC handlers + preload wiring

**Files:**
- Create: `src/main/ipc/register-category-handlers.ts`
- Test: `src/main/ipc/register-category-handlers.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

**Interfaces:**
- Consumes: `listCategories`, `createCategory`, `updateCategory`, `deleteCategory` from `../database/repositories/category-repository` (Task 2); `CategoryRecord` from `../../shared/category`.
- Produces: IPC channels `categories:list`, `categories:create`, `categories:update`, `categories:delete`; `window.api.categories.{list, create, update, delete}` for Task 7's `useCategories` hook to call.

- [ ] **Step 1: Write the failing IPC handler tests**

```typescript
// src/main/ipc/register-category-handlers.test.ts
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

import { registerCategoryHandlers } from './register-category-handlers'
import { createDbClient, type DbClient } from '../database/client'

describe('registerCategoryHandlers', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    handlers.clear()
    dbFile = path.join(os.tmpdir(), `pos-ipc-categories-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../drizzle'))
    registerCategoryHandlers(client.db)
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('registers all four category channels', () => {
    expect(handlers.has('categories:list')).toBe(true)
    expect(handlers.has('categories:create')).toBe(true)
    expect(handlers.has('categories:update')).toBe(true)
    expect(handlers.has('categories:delete')).toBe(true)
  })

  it('categories:create creates a category and categories:list returns it', () => {
    const createHandler = handlers.get('categories:create')!
    const listHandler = handlers.get('categories:list')!

    const created = createHandler({}, 'Beverages') as { name: string }
    expect(created.name).toBe('Beverages')

    expect(listHandler({})).toHaveLength(1)
  })

  it('categories:update renames a category', () => {
    const createHandler = handlers.get('categories:create')!
    const updateHandler = handlers.get('categories:update')!

    const created = createHandler({}, 'Beverages') as { id: string }
    const updated = updateHandler({}, created.id, 'Drinks') as { name: string }

    expect(updated.name).toBe('Drinks')
  })

  it('categories:delete removes a category', () => {
    const createHandler = handlers.get('categories:create')!
    const deleteHandler = handlers.get('categories:delete')!
    const listHandler = handlers.get('categories:list')!

    const created = createHandler({}, 'Beverages') as { id: string }
    deleteHandler({}, created.id)

    expect(listHandler({})).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- register-category-handlers`
Expected: FAIL — `register-category-handlers.ts` does not exist yet.

- [ ] **Step 3: Implement the IPC handler**

```typescript
// src/main/ipc/register-category-handlers.ts
import { ipcMain } from 'electron'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory
} from '../database/repositories/category-repository'
import type { CategoryRecord } from '../../shared/category'

export function registerCategoryHandlers(db: BetterSQLite3Database): void {
  ipcMain.handle('categories:list', (): CategoryRecord[] => {
    return listCategories(db)
  })

  ipcMain.handle('categories:create', (_event, name: string): CategoryRecord => {
    return createCategory(db, name)
  })

  ipcMain.handle('categories:update', (_event, id: string, name: string): CategoryRecord => {
    return updateCategory(db, id, name)
  })

  ipcMain.handle('categories:delete', (_event, id: string): void => {
    deleteCategory(db, id)
  })
}
```

- [ ] **Step 4: Wire it into `main/index.ts`**

Add the import next to the other `register*Handlers` imports:

```typescript
import { registerCategoryHandlers } from './ipc/register-category-handlers'
```

And call it alongside the others (right after `registerProductHandlers(dbClient.db)`):

```typescript
  registerCategoryHandlers(dbClient.db)
```

- [ ] **Step 5: Expose it through the preload script**

In `src/preload/index.ts`, add the import:

```typescript
import type { CategoryRecord } from '../shared/category'
```

And extend the `api` object (after the existing `products` block):

```typescript
  categories: {
    list: (): Promise<CategoryRecord[]> => ipcRenderer.invoke('categories:list'),
    create: (name: string): Promise<CategoryRecord> => ipcRenderer.invoke('categories:create', name),
    update: (id: string, name: string): Promise<CategoryRecord> =>
      ipcRenderer.invoke('categories:update', id, name),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('categories:delete', id)
  },
```

- [ ] **Step 6: Type it in `src/preload/index.d.ts`**

Add the same import, and extend `Window['api']`:

```typescript
      categories: {
        list: () => Promise<CategoryRecord[]>
        create: (name: string) => Promise<CategoryRecord>
        update: (id: string, name: string) => Promise<CategoryRecord>
        delete: (id: string) => Promise<void>
      }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- register-category-handlers`
Expected: PASS, all 4 tests green.

- [ ] **Step 8: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: still fails at typecheck for the same pre-existing reason as Task 1 Step 4 (product-repository.ts not yet updated) — confirm no *new* typecheck failures were introduced by this task.

- [ ] **Step 9: Commit**

```bash
git add src/main/ipc/register-category-handlers.ts src/main/ipc/register-category-handlers.test.ts src/main/index.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat: expose categories:* over IPC and preload"
```

---

### Task 4: Product image storage helpers

**Files:**
- Create: `src/main/storage/product-images.ts`
- Test: `src/main/storage/product-images.test.ts`
- Modify: `src/main/database/db-path.ts`
- Test: `src/main/database/db-path.test.ts` (extend)

**Interfaces:**
- Consumes: nothing new beyond Node's `node:fs`/`node:path`/`node:crypto` and `@electron-toolkit/utils`'s `is` (matching `db-path.ts`'s existing pattern).
- Produces: `function getProductImagesPath(): string` in `db-path.ts`; `function storeProductImage(sourcePath: string): string` (returns the stored filename) and `function deleteProductImage(filename: string): void` in `product-images.ts`; `class UnsupportedImageTypeError` — for Task 6 (product repository) to import and use.

- [ ] **Step 1: Add `getProductImagesPath` to `db-path.ts` and its test**

Add to `src/main/database/db-path.ts` (after the existing `getMigrationsPath`):

```typescript
// Same dev/production split as getDbPath/getMigrationsPath: in dev, a
// project-local folder that's easy to find and safe to gitignore; in
// production, Electron's userData directory, which is guaranteed writable
// and unique per install.
export function getProductImagesPath(): string {
  if (is.dev) {
    return path.resolve(process.cwd(), 'dev-product-images')
  }
  return path.join(app.getPath('userData'), 'product-images')
}
```

Add to `src/main/database/db-path.test.ts` (a new `describe` block, following the file's existing `isMock`/`vi.mock` setup):

```typescript
describe('getProductImagesPath', () => {
  afterEach(() => {
    isMock.dev = true
  })

  it('resolves to a project-local folder in dev mode', () => {
    isMock.dev = true
    expect(getProductImagesPath()).toBe(path.resolve(process.cwd(), 'dev-product-images'))
  })

  it("resolves under Electron's userData directory in production", () => {
    isMock.dev = false
    expect(getProductImagesPath()).toBe(path.join('C:\\fake\\userData', 'product-images'))
  })
})
```

(Add `getProductImagesPath` to the existing `import { getDbPath, getMigrationsPath } from './db-path'` line in the test file.)

Add `dev-product-images` to `.gitignore`, alongside the existing `dev.db` entries:

```
dev-product-images/
```

- [ ] **Step 2: Run the test to verify it fails, then passes**

Run: `npm test -- db-path`
Expected: FAIL (function doesn't exist) → implement → PASS, all tests in the file green.

- [ ] **Step 3: Write the failing tests for `storeProductImage`/`deleteProductImage`**

```typescript
// src/main/storage/product-images.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const isMock = { dev: true }
vi.mock('@electron-toolkit/utils', () => ({ is: isMock }))
vi.mock('electron', () => ({ app: { getPath: vi.fn() } }))

import { storeProductImage, deleteProductImage, UnsupportedImageTypeError } from './product-images'
import { getProductImagesPath } from '../database/db-path'

describe('storeProductImage', () => {
  let sourceFile: string

  beforeEach(() => {
    sourceFile = path.join(os.tmpdir(), `pos-source-image-${Date.now()}.png`)
    fs.writeFileSync(sourceFile, 'fake-png-bytes')
  })

  afterEach(() => {
    if (fs.existsSync(sourceFile)) fs.rmSync(sourceFile)
    const imagesDir = getProductImagesPath()
    if (fs.existsSync(imagesDir)) fs.rmSync(imagesDir, { recursive: true, force: true })
  })

  it('copies the source file into the product-images folder under a new filename', () => {
    const filename = storeProductImage(sourceFile)
    expect(filename).toMatch(/\.png$/)
    const storedPath = path.join(getProductImagesPath(), filename)
    expect(fs.existsSync(storedPath)).toBe(true)
    expect(fs.readFileSync(storedPath, 'utf8')).toBe('fake-png-bytes')
  })

  it('does not modify or remove the original source file', () => {
    storeProductImage(sourceFile)
    expect(fs.existsSync(sourceFile)).toBe(true)
    expect(fs.readFileSync(sourceFile, 'utf8')).toBe('fake-png-bytes')
  })

  it('generates a different filename for each call, even for the same source', () => {
    const first = storeProductImage(sourceFile)
    const second = storeProductImage(sourceFile)
    expect(first).not.toBe(second)
  })

  it('rejects an unsupported file extension', () => {
    const badFile = path.join(os.tmpdir(), `pos-source-image-${Date.now()}.exe`)
    fs.writeFileSync(badFile, 'not an image')
    expect(() => storeProductImage(badFile)).toThrow(UnsupportedImageTypeError)
    fs.rmSync(badFile)
  })
})

describe('deleteProductImage', () => {
  afterEach(() => {
    const imagesDir = getProductImagesPath()
    if (fs.existsSync(imagesDir)) fs.rmSync(imagesDir, { recursive: true, force: true })
  })

  it('deletes a previously-stored image', () => {
    const sourceFile = path.join(os.tmpdir(), `pos-source-image-${Date.now()}.png`)
    fs.writeFileSync(sourceFile, 'fake-png-bytes')
    const filename = storeProductImage(sourceFile)
    fs.rmSync(sourceFile)

    deleteProductImage(filename)

    expect(fs.existsSync(path.join(getProductImagesPath(), filename))).toBe(false)
  })

  it('does not throw when the filename does not exist', () => {
    expect(() => deleteProductImage('does-not-exist.png')).not.toThrow()
  })
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm test -- product-images`
Expected: FAIL — `product-images.ts` does not exist yet.

- [ ] **Step 5: Implement `storeProductImage`/`deleteProductImage`**

```typescript
// src/main/storage/product-images.ts
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { getProductImagesPath } from '../database/db-path'

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

export class UnsupportedImageTypeError extends Error {
  constructor(extension: string) {
    super(
      `Unsupported image type "${extension}". Allowed: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`
    )
    this.name = 'UnsupportedImageTypeError'
  }
}

// Copies a source image file (picked by the user from anywhere on disk) into
// this app's own product-images storage folder under a fresh UUID filename,
// so a product record never depends on the original file staying where it
// was. Returns the stored filename only (not an absolute path) — that's
// what gets persisted on the product record, matching getDbPath's/
// getMigrationsPath's existing filename-not-absolute-path convention.
export function storeProductImage(sourcePath: string): string {
  const extension = path.extname(sourcePath).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new UnsupportedImageTypeError(extension)
  }

  const imagesDir = getProductImagesPath()
  fs.mkdirSync(imagesDir, { recursive: true })

  const filename = `${randomUUID()}${extension}`
  fs.copyFileSync(sourcePath, path.join(imagesDir, filename))

  return filename
}

// Deletes a previously-stored product image by its stored filename. Not an
// error if the file is already gone — the goal is "make sure it's gone,"
// not "prove it was there."
export function deleteProductImage(filename: string): void {
  const filePath = path.join(getProductImagesPath(), filename)
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath)
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- product-images`
Expected: PASS, all 6 tests green.

- [ ] **Step 7: Commit**

```bash
git add src/main/database/db-path.ts src/main/database/db-path.test.ts src/main/storage/product-images.ts src/main/storage/product-images.test.ts .gitignore
git commit -m "feat: add product-image storage helpers (store, delete)"
```

---

### Task 5: Image picker IPC + `app-image://` protocol

**Files:**
- Create: `src/main/ipc/register-image-handlers.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

**Interfaces:**
- Consumes: `getProductImagesPath` from `../database/db-path.ts` (Task 4).
- Produces: IPC channel `images:pickProductImage` returning `{ path: string; previewDataUrl: string } | null`; `window.api.images.pickProductImage(): Promise<{ path: string; previewDataUrl: string } | null>` for Task 8's `ProductForm` to call; the registered `app-image://` protocol, which Task 9's `ProductList` thumbnails and Task 8's post-save preview rely on at runtime (not something either imports — it's a URL scheme, used as `app-image://<filename>` in an `<img src>`).

**This task has no automated test.** `dialog.showOpenDialog` opens a real native OS file picker, and the custom protocol is resolved by Chromium's own networking stack — neither is meaningfully mockable in a way that would prove anything beyond "the mock returned what the mock was told to return." This is the same category of gap Phase 6 already has for hardware/install verification: it's covered by manual smoke-testing instead. See Task 9's manual verification note.

- [ ] **Step 1: Implement the image picker IPC handler**

```typescript
// src/main/ipc/register-image-handlers.ts
import { ipcMain, dialog } from 'electron'
import fs from 'node:fs'

export function registerImageHandlers(): void {
  ipcMain.handle(
    'images:pickProductImage',
    async (): Promise<{ path: string; previewDataUrl: string } | null> => {
      const result = await dialog.showOpenDialog({
        title: 'Select product image',
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
        properties: ['openFile']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const filePath = result.filePaths[0]
      const buffer = fs.readFileSync(filePath)
      const extension = filePath.split('.').pop()?.toLowerCase() ?? 'png'
      const mimeType = extension === 'jpg' ? 'jpeg' : extension
      const previewDataUrl = `data:image/${mimeType};base64,${buffer.toString('base64')}`

      return { path: filePath, previewDataUrl }
    }
  )
}
```

- [ ] **Step 2: Register the `app-image://` protocol in `main/index.ts`**

Add to the top-level imports:

```typescript
import { protocol, net } from 'electron'
import { pathToFileURL } from 'node:url'
import { getDbPath, getMigrationsPath, getProductImagesPath } from './database/db-path'
import { registerImageHandlers } from './ipc/register-image-handlers'
```

(This replaces the existing `import { getDbPath, getMigrationsPath } from './database/db-path'` line — add `getProductImagesPath` to it rather than a separate import line.)

Immediately after the imports, **before** `app.whenReady()` (Electron requires privileged schemes to be registered before the app is ready):

```typescript
protocol.registerSchemesAsPrivileged([
  { scheme: 'app-image', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])
```

Inside `app.whenReady().then(async () => { ... })`, add the protocol handler (anywhere after `electronApp.setAppUserModelId(...)` is fine — it doesn't depend on the DB or window):

```typescript
  protocol.handle('app-image', (request) => {
    // path.basename strips any directory-traversal attempt from the
    // requested filename before it's joined onto the real storage path —
    // defense in depth, even though this app has no untrusted remote
    // content that could ever craft a malicious app-image:// URL.
    const filename = path.basename(decodeURIComponent(new URL(request.url).hostname))
    const filePath = join(getProductImagesPath(), filename)
    return net.fetch(pathToFileURL(filePath).toString())
  })
```

(`path` isn't currently imported as a namespace in this file — only `join` from `'path'` is. Add `import path from 'node:path'` alongside the existing `import { join } from 'path'` line so `path.basename` is available; keep using the existing `join` for the rest of the file.)

And register the new handler alongside the others:

```typescript
  registerImageHandlers()
```

- [ ] **Step 3: Expose the picker through the preload script**

In `src/preload/index.ts`, extend the `api` object:

```typescript
  images: {
    pickProductImage: (): Promise<{ path: string; previewDataUrl: string } | null> =>
      ipcRenderer.invoke('images:pickProductImage')
  },
```

- [ ] **Step 4: Type it in `src/preload/index.d.ts`**

```typescript
      images: {
        pickProductImage: () => Promise<{ path: string; previewDataUrl: string } | null>
      }
```

- [ ] **Step 5: Run the full suite, typecheck, and lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tests still pass (no test file touches this task's code); typecheck still fails only for the pre-existing `product-repository.ts` reason from Task 1 (confirm no new failures); lint clean.

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/register-image-handlers.ts src/main/index.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat: add product-image picker IPC and app-image:// protocol"
```

---

### Task 6: Wire categories and images into the product repository

**Files:**
- Modify: `src/main/database/repositories/product-repository.ts`
- Modify: `src/main/database/repositories/product-repository.test.ts` (extend)
- Modify: `src/main/ipc/register-product-handlers.ts` (no behavior change needed — confirm it still typechecks against the new input/output shapes)

**Interfaces:**
- Consumes: `storeProductImage`, `deleteProductImage` from `../../storage/product-images` (Task 4); `categories` table from `../schema` (Task 1, to validate `categoryId` exists); `CreateProductInput`/`UpdateProductInput`/`ProductRecord` from `../../../shared/product` (Task 1).
- Produces: `createProduct`/`updateProduct` now read `categoryId`/`imageSourcePath`/`clearImage` from their input and persist `categoryId`/`imagePath` on the returned `ProductRecord`; a new `class CategoryNotFoundOnProductError` — thrown when a `categoryId` is provided that doesn't exist (distinct name from `category-repository.ts`'s own `CategoryNotFoundError`, since this is a different call site's validation, not a categories-table lookup miss).

- [ ] **Step 1: Extend the failing tests**

Add to `src/main/database/repositories/product-repository.test.ts` (add `createCategory` to a new import from `./category-repository`, and `CategoryNotFoundOnProductError` to the existing import from `./product-repository`; add these as new `it` blocks inside the existing `describe('product repository', ...)` block, or a new nested `describe` — either is fine, match the file's existing flat style):

```typescript
  it('creates a product with a category assigned', () => {
    const category = createCategory(client.db, 'Beverages')
    const product = createProduct(client.db, {
      barcode: '8850003000014',
      name: 'Water',
      priceCents: 1000,
      stock: 50,
      categoryId: category.id
    })
    expect(product.categoryId).toBe(category.id)
  })

  it('creates a product with no category when categoryId is omitted', () => {
    const product = createProduct(client.db, {
      barcode: '8850004000015',
      name: 'No Category Item',
      priceCents: 500,
      stock: 5
    })
    expect(product.categoryId).toBeNull()
  })

  it('rejects creating a product with a categoryId that does not exist', () => {
    expect(() =>
      createProduct(client.db, {
        barcode: '8850005000016',
        name: 'Bad Category',
        priceCents: 500,
        stock: 5,
        categoryId: 'does-not-exist'
      })
    ).toThrow(CategoryNotFoundOnProductError)
  })

  it('creates a product with an image, storing it under a new filename', () => {
    const sourceFile = path.join(os.tmpdir(), `pos-product-image-${Date.now()}.png`)
    fs.writeFileSync(sourceFile, 'fake-png-bytes')

    const product = createProduct(client.db, {
      barcode: '8850006000017',
      name: 'Has Image',
      priceCents: 1500,
      stock: 20,
      imageSourcePath: sourceFile
    })

    expect(product.imagePath).toMatch(/\.png$/)
    fs.rmSync(sourceFile)
    if (product.imagePath) deleteProductImage(product.imagePath)
  })

  it('updates a product to add a category', () => {
    const category = createCategory(client.db, 'Snacks')
    const created = createProduct(client.db, { barcode: '222', name: 'A', priceCents: 100, stock: 1 })

    const updated = updateProduct(client.db, created.id, { categoryId: category.id })

    expect(updated.categoryId).toBe(category.id)
  })

  it('updates a product to clear its category by passing categoryId: null', () => {
    const category = createCategory(client.db, 'Snacks')
    const created = createProduct(client.db, {
      barcode: '333',
      name: 'A',
      priceCents: 100,
      stock: 1,
      categoryId: category.id
    })

    const updated = updateProduct(client.db, created.id, { categoryId: null })

    expect(updated.categoryId).toBeNull()
  })

  it('updates a product to replace its image, deleting the old stored file', () => {
    const firstSource = path.join(os.tmpdir(), `pos-product-image-a-${Date.now()}.png`)
    fs.writeFileSync(firstSource, 'first-image')
    const created = createProduct(client.db, {
      barcode: '444',
      name: 'A',
      priceCents: 100,
      stock: 1,
      imageSourcePath: firstSource
    })
    fs.rmSync(firstSource)
    const firstStoredPath = path.join(getProductImagesPath(), created.imagePath as string)
    expect(fs.existsSync(firstStoredPath)).toBe(true)

    const secondSource = path.join(os.tmpdir(), `pos-product-image-b-${Date.now()}.png`)
    fs.writeFileSync(secondSource, 'second-image')
    const updated = updateProduct(client.db, created.id, { imageSourcePath: secondSource })
    fs.rmSync(secondSource)

    expect(updated.imagePath).not.toBe(created.imagePath)
    expect(fs.existsSync(firstStoredPath)).toBe(false)
    if (updated.imagePath) deleteProductImage(updated.imagePath)
  })

  it('updates a product to clear its image with clearImage: true, deleting the stored file', () => {
    const sourceFile = path.join(os.tmpdir(), `pos-product-image-c-${Date.now()}.png`)
    fs.writeFileSync(sourceFile, 'image-bytes')
    const created = createProduct(client.db, {
      barcode: '555',
      name: 'A',
      priceCents: 100,
      stock: 1,
      imageSourcePath: sourceFile
    })
    fs.rmSync(sourceFile)
    const storedPath = path.join(getProductImagesPath(), created.imagePath as string)

    const updated = updateProduct(client.db, created.id, { clearImage: true })

    expect(updated.imagePath).toBeNull()
    expect(fs.existsSync(storedPath)).toBe(false)
  })
```

Add these imports at the top of the test file: `import fs from 'node:fs'`, `import os from 'node:os'` (alongside the existing `import path from 'node:path'`), `import { createCategory } from './category-repository'`, `import { getProductImagesPath } from '../db-path'`, and add `CategoryNotFoundOnProductError`, `deleteProductImage` is imported from `'../../storage/product-images'` — add that import too. Add `CategoryNotFoundOnProductError` to the existing `import { ... } from './product-repository'` line.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- product-repository`
Expected: FAIL — `categoryId`/`imageSourcePath`/`clearImage` aren't handled by `createProduct`/`updateProduct` yet, and `CategoryNotFoundOnProductError` isn't exported yet.

- [ ] **Step 3: Update `product-repository.ts`**

Change the imports at the top of the file from:

```typescript
import { randomUUID } from 'node:crypto'
import { eq, like, or } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { products } from '../schema'
import type { ProductRecord, CreateProductInput, UpdateProductInput } from '../../../shared/product'
```

to:

```typescript
import { randomUUID } from 'node:crypto'
import { eq, like, or } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { products, categories } from '../schema'
import type { ProductRecord, CreateProductInput, UpdateProductInput } from '../../../shared/product'
import { storeProductImage, deleteProductImage } from '../../storage/product-images'
```

Add a new error class alongside the existing ones:

```typescript
export class CategoryNotFoundOnProductError extends Error {
  constructor(categoryId: string) {
    super(`No category found with id "${categoryId}"`)
    this.name = 'CategoryNotFoundOnProductError'
  }
}
```

Add a validation helper alongside the existing `validateBarcode`/`validateName`/etc.:

```typescript
function validateCategoryId(db: BetterSQLite3Database, categoryId: string | null | undefined): void {
  if (categoryId === null || categoryId === undefined) {
    return
  }
  const category = db.select().from(categories).where(eq(categories.id, categoryId)).get()
  if (!category) {
    throw new CategoryNotFoundOnProductError(categoryId)
  }
}
```

Change `createProduct` from:

```typescript
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
```

to:

```typescript
export function createProduct(db: BetterSQLite3Database, input: CreateProductInput): ProductRecord {
  validateBarcode(input.barcode)
  validateName(input.name)
  validatePriceCents(input.priceCents)
  validateStock(input.stock)
  validateCategoryId(db, input.categoryId)

  const imagePath = input.imageSourcePath ? storeProductImage(input.imageSourcePath) : null

  const now = new Date().toISOString()
  const record: ProductRecord = {
    id: randomUUID(),
    barcode: input.barcode.trim(),
    name: input.name.trim(),
    priceCents: input.priceCents,
    stock: input.stock,
    isActive: true,
    categoryId: input.categoryId ?? null,
    imagePath,
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
```

Change `updateProduct` from:

```typescript
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
```

to:

```typescript
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
    isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
    categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId
  }

  validateBarcode(next.barcode)
  validateName(next.name)
  validatePriceCents(next.priceCents)
  validateStock(next.stock)
  validateCategoryId(db, next.categoryId)

  // Image handling is independent of the other fields' undefined-means-
  // unchanged convention, because it has three distinct states to express
  // (leave alone / replace / clear), not two:
  let imagePath = existing.imagePath
  if (input.clearImage) {
    if (existing.imagePath) deleteProductImage(existing.imagePath)
    imagePath = null
  } else if (input.imageSourcePath) {
    if (existing.imagePath) deleteProductImage(existing.imagePath)
    imagePath = storeProductImage(input.imageSourcePath)
  }

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
        categoryId: next.categoryId,
        imagePath,
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

  return {
    ...existing,
    barcode,
    name,
    priceCents: next.priceCents,
    stock: next.stock,
    isActive: next.isActive,
    categoryId: next.categoryId,
    imagePath,
    updatedAt
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- product-repository`
Expected: PASS, all tests green (the original tests plus the 8 new ones from Step 1, plus Task 2's cross-file test that depends on `categoryId` now also passes).

- [ ] **Step 5: Run the full suite, typecheck, and lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS — this is the task that resolves the typecheck failure Task 1/3 left dangling (`ProductRecord` and `ProductRow` now agree, and every `ProductRecord` object literal in the codebase includes the new fields). Confirm 0 typecheck errors and 0 lint errors before moving on.

- [ ] **Step 6: Commit**

```bash
git add src/main/database/repositories/product-repository.ts src/main/database/repositories/product-repository.test.ts
git commit -m "feat: persist product category and image on create/update"
```

---

### Task 7: `useCategories` hook + `CategoryManager` modal

**Files:**
- Create: `src/renderer/src/features/categories/useCategories.ts`
- Test: `src/renderer/src/features/categories/useCategories.test.ts`
- Create: `src/renderer/src/features/categories/CategoryManager.tsx`
- Test: `src/renderer/src/features/categories/CategoryManager.test.tsx`
- Modify: `src/renderer/src/assets/main.css`

**Interfaces:**
- Consumes: `window.api.categories.*` (Task 3); `toUserMessage` from `../../lib/ipcError`.
- Produces: `function useCategories(): { categories: CategoryRecord[]; loading: boolean; error: string | null; createCategory: (name: string) => Promise<CategoryRecord>; updateCategory: (id: string, name: string) => Promise<CategoryRecord>; deleteCategory: (id: string) => Promise<void> }`; `CategoryManagerProps { onClose: () => void }` (default export `CategoryManager`) — for Task 9 (`ProductsPage`) to render.

- [ ] **Step 1: Write the failing `useCategories` tests**

```typescript
// src/renderer/src/features/categories/useCategories.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useCategories } from './useCategories'
import type { CategoryRecord } from '../../../../shared/category'

const beverages: CategoryRecord = {
  id: '1',
  name: 'Beverages',
  createdAt: '',
  updatedAt: ''
}

describe('useCategories', () => {
  beforeEach(() => {
    window.api = {
      dbHealth: vi.fn(),
      products: { list: vi.fn(), create: vi.fn(), update: vi.fn(), getByBarcode: vi.fn() },
      sales: { complete: vi.fn() },
      dashboard: { summary: vi.fn(), topProducts: vi.fn(), sevenDaySales: vi.fn(), lowStock: vi.fn() },
      salesHistory: { list: vi.fn(), detail: vi.fn() },
      categories: {
        list: vi.fn().mockResolvedValue([beverages]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    } as unknown as Window['api']
  })

  it('loads categories on mount', async () => {
    const { result } = renderHook(() => useCategories())
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.categories).toEqual([beverages])
    expect(result.current.error).toBeNull()
  })

  it('surfaces a clean error message on a failed load', async () => {
    ;(window.api.categories.list as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Error invoking remote method 'categories:list': Something broke")
    )
    const { result } = renderHook(() => useCategories())

    await waitFor(() => expect(result.current.error).toBe('Something broke'))
  })

  it('createCategory adds a category and reloads the list', async () => {
    const { result } = renderHook(() => useCategories())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const snacks: CategoryRecord = { id: '2', name: 'Snacks', createdAt: '', updatedAt: '' }
    ;(window.api.categories.create as ReturnType<typeof vi.fn>).mockResolvedValue(snacks)
    ;(window.api.categories.list as ReturnType<typeof vi.fn>).mockResolvedValue([beverages, snacks])

    await act(async () => {
      await result.current.createCategory('Snacks')
    })

    expect(window.api.categories.create).toHaveBeenCalledWith('Snacks')
    expect(result.current.categories).toEqual([beverages, snacks])
  })

  it('deleteCategory removes a category and reloads the list', async () => {
    const { result } = renderHook(() => useCategories())
    await waitFor(() => expect(result.current.loading).toBe(false))

    ;(window.api.categories.list as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await act(async () => {
      await result.current.deleteCategory('1')
    })

    expect(window.api.categories.delete).toHaveBeenCalledWith('1')
    expect(result.current.categories).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- useCategories`
Expected: FAIL — `useCategories.ts` does not exist yet.

- [ ] **Step 3: Implement `useCategories`**

```typescript
// src/renderer/src/features/categories/useCategories.ts
import { useCallback, useEffect, useState } from 'react'
import type { CategoryRecord } from '../../../../shared/category'
import { toUserMessage } from '../../lib/ipcError'

export interface UseCategoriesResult {
  categories: CategoryRecord[]
  loading: boolean
  error: string | null
  createCategory: (name: string) => Promise<CategoryRecord>
  updateCategory: (id: string, name: string) => Promise<CategoryRecord>
  deleteCategory: (id: string) => Promise<void>
}

export function useCategories(): UseCategoriesResult {
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const result = await window.api.categories.list()
      setCategories(result)
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

  const createCategory = useCallback(
    async (name: string): Promise<CategoryRecord> => {
      let created: CategoryRecord
      try {
        created = await window.api.categories.create(name)
      } catch (err) {
        throw new Error(toUserMessage(err))
      }
      await reload()
      return created
    },
    [reload]
  )

  const updateCategory = useCallback(
    async (id: string, name: string): Promise<CategoryRecord> => {
      let updated: CategoryRecord
      try {
        updated = await window.api.categories.update(id, name)
      } catch (err) {
        throw new Error(toUserMessage(err))
      }
      await reload()
      return updated
    },
    [reload]
  )

  const deleteCategory = useCallback(
    async (id: string): Promise<void> => {
      try {
        await window.api.categories.delete(id)
      } catch (err) {
        throw new Error(toUserMessage(err))
      }
      await reload()
    },
    [reload]
  )

  return { categories, loading, error, createCategory, updateCategory, deleteCategory }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- useCategories`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Write the failing `CategoryManager` tests**

```typescript
// src/renderer/src/features/categories/CategoryManager.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CategoryManager from './CategoryManager'
import type { CategoryRecord } from '../../../../shared/category'

const beverages: CategoryRecord = { id: '1', name: 'Beverages', createdAt: '', updatedAt: '' }

describe('CategoryManager', () => {
  beforeEach(() => {
    window.api = {
      dbHealth: vi.fn(),
      products: { list: vi.fn(), create: vi.fn(), update: vi.fn(), getByBarcode: vi.fn() },
      sales: { complete: vi.fn() },
      dashboard: { summary: vi.fn(), topProducts: vi.fn(), sevenDaySales: vi.fn(), lowStock: vi.fn() },
      salesHistory: { list: vi.fn(), detail: vi.fn() },
      categories: {
        list: vi.fn().mockResolvedValue([beverages]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    } as unknown as Window['api']
  })

  it('lists existing categories', async () => {
    render(<CategoryManager onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Beverages')).toBeInTheDocument())
  })

  it('adds a new category', async () => {
    const user = userEvent.setup()
    const snacks: CategoryRecord = { id: '2', name: 'Snacks', createdAt: '', updatedAt: '' }
    ;(window.api.categories.create as ReturnType<typeof vi.fn>).mockResolvedValue(snacks)
    ;(window.api.categories.list as ReturnType<typeof vi.fn>).mockResolvedValue([beverages, snacks])

    render(<CategoryManager onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Beverages')).toBeInTheDocument())

    await user.type(screen.getByLabelText('New category name'), 'Snacks')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(screen.getByText('Snacks')).toBeInTheDocument())
    expect(window.api.categories.create).toHaveBeenCalledWith('Snacks')
  })

  it('deletes a category', async () => {
    const user = userEvent.setup()
    ;(window.api.categories.list as ReturnType<typeof vi.fn>).mockResolvedValue([])

    render(<CategoryManager onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Beverages')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Delete Beverages' }))

    await waitFor(() => expect(screen.queryByText('Beverages')).not.toBeInTheDocument())
  })

  it('shows an error message when deleting a category still in use', async () => {
    const user = userEvent.setup()
    ;(window.api.categories.delete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error(
        "Error invoking remote method 'categories:delete': CategoryInUseError: Cannot delete \"Beverages\": 2 product(s) are still assigned to it"
      )
    )

    render(<CategoryManager onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Beverages')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Delete Beverages' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Cannot delete "Beverages": 2 product(s) are still assigned to it'
      )
    )
  })

  it('calls onClose when the Close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<CategoryManager onClose={onClose} />)
    await waitFor(() => expect(screen.getByText('Beverages')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test -- CategoryManager`
Expected: FAIL — `CategoryManager.tsx` does not exist yet.

- [ ] **Step 7: Implement `CategoryManager`**

```typescript
// src/renderer/src/features/categories/CategoryManager.tsx
import { useState } from 'react'
import { useCategories } from './useCategories'

export interface CategoryManagerProps {
  onClose: () => void
}

function CategoryManager({ onClose }: CategoryManagerProps): React.JSX.Element {
  const { categories, loading, error, createCategory, deleteCategory } = useCategories()
  const [newName, setNewName] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleAdd(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (newName.trim().length === 0) {
      return
    }
    try {
      await createCategory(newName.trim())
      setNewName('')
      setActionError(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDelete(id: string): Promise<void> {
    try {
      await deleteCategory(id)
      setActionError(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-manager-title"
      >
        <h2 id="category-manager-title">Manage Categories</h2>

        {loading && <div className="loading-row">Loading categories…</div>}
        {(error || actionError) && (
          <p role="alert" className="alert alert-danger">
            {error ?? actionError}
          </p>
        )}

        {!loading && (
          <ul className="category-manager-list">
            {categories.map((category) => (
              <li key={category.id}>
                <span>{category.name}</span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleDelete(category.id)}
                >
                  {`Delete ${category.name}`}
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAdd} className="category-manager-add-form">
          <label htmlFor="new-category-name">New category name</label>
          <input
            id="new-category-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            Add
          </button>
        </form>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default CategoryManager
```

Note: this deliberately does not include a rename (`updateCategory`) UI control in this task — the hook exposes it (Interfaces above), and `useCategories.test.ts` already covers the hook's own `updateCategory` behavior, but the button/inline-edit UI for renaming is left out of the initial `CategoryManager` UI to keep this task's own test list matching exactly what's being built. If a rename UI is wanted, it's a small, independent follow-up to this same component.

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- CategoryManager`
Expected: PASS, all 5 tests green.

- [ ] **Step 9: Add the CSS**

Append to `src/renderer/src/assets/main.css`:

```css
/* ---- Category Manager ---- */

.category-manager-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-height: 240px;
  overflow-y: auto;
}

.category-manager-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
}

.category-manager-add-form {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
}

.category-manager-add-form label {
  display: none;
}

.category-manager-add-form input {
  flex: 1;
  padding: 9px var(--space-3);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  font-size: 14px;
}
```

(The label is visually hidden but stays in the DOM for the `aria-label`-equivalent association the tests rely on — `htmlFor`/`id` already makes `getByLabelText('New category name')` work regardless of visibility.)

- [ ] **Step 10: Run the full suite, typecheck, and lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS, no regressions.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/src/features/categories/ src/renderer/src/assets/main.css
git commit -m "feat: add category management hook and modal"
```

---

### Task 8: `ProductForm` — category select + image picker/preview

**Files:**
- Modify: `src/renderer/src/features/products/ProductForm.tsx`
- Modify: `src/renderer/src/features/products/ProductForm.test.tsx` (extend)
- Modify: `src/renderer/src/assets/main.css`

**Interfaces:**
- Consumes: `window.api.images.pickProductImage()` (Task 5); `CategoryRecord` from `../../../../shared/category`; `useCategories` from `../categories/useCategories` (Task 7).
- Produces: `ProductFormProps` gains nothing new in its own signature (it still emits `CreateProductInput | UpdateProductInput`, now including `categoryId`/`imageSourcePath`/`clearImage` per Task 1's extended types) — no new exports for later tasks to consume, this is a leaf UI change.

- [ ] **Step 1: Extend the failing `ProductForm` tests**

Add to `src/renderer/src/features/products/ProductForm.test.tsx` (mock `window.api.categories.list` in every existing test's setup — add a `beforeEach` `window.api = {...}` block if the file doesn't already centralize one, matching whatever the file's current setup style is; add `categories: { list: vi.fn().mockResolvedValue([beverages]), create: vi.fn(), update: vi.fn(), delete: vi.fn() }` and `images: { pickProductImage: vi.fn() }` to it, plus this fixture near the top of the file):

```typescript
const beverages: CategoryRecord = { id: '1', name: 'Beverages', createdAt: '', updatedAt: '' }
```

(add `import type { CategoryRecord } from '../../../../shared/category'` to the file's imports)

New tests:

```typescript
  it('shows a category dropdown populated from the categories list', async () => {
    render(<ProductForm submitting={false} error={null} onSubmit={vi.fn()} onCancel={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('option', { name: 'Beverages' })).toBeInTheDocument())
  })

  it('includes the selected categoryId when submitting a new product', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ProductForm submitting={false} error={null} onSubmit={onSubmit} onCancel={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('option', { name: 'Beverages' })).toBeInTheDocument())

    await user.type(screen.getByLabelText('Barcode'), '111')
    await user.type(screen.getByLabelText('Name'), 'Coke')
    await user.type(screen.getByLabelText('Price (Baht)'), '20')
    await user.type(screen.getByLabelText('Stock'), '5')
    await user.selectOptions(screen.getByLabelText('Category'), 'Beverages')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: '1' })
    )
  })

  it('submits categoryId: undefined when no category is selected (the placeholder option)', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ProductForm submitting={false} error={null} onSubmit={onSubmit} onCancel={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('option', { name: 'Beverages' })).toBeInTheDocument())

    await user.type(screen.getByLabelText('Barcode'), '111')
    await user.type(screen.getByLabelText('Name'), 'Coke')
    await user.type(screen.getByLabelText('Price (Baht)'), '20')
    await user.type(screen.getByLabelText('Stock'), '5')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: undefined })
    )
  })

  it('picks an image and shows a preview', async () => {
    const user = userEvent.setup()
    ;(window.api.images.pickProductImage as ReturnType<typeof vi.fn>).mockResolvedValue({
      path: 'C:\\fake\\picked-image.png',
      previewDataUrl: 'data:image/png;base64,ZmFrZQ=='
    })
    render(<ProductForm submitting={false} error={null} onSubmit={vi.fn()} onCancel={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('option', { name: 'Beverages' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Choose Image' }))

    await waitFor(() =>
      expect(screen.getByAltText('Product preview')).toHaveAttribute(
        'src',
        'data:image/png;base64,ZmFrZQ=='
      )
    )
  })

  it('includes the picked imageSourcePath when submitting', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    ;(window.api.images.pickProductImage as ReturnType<typeof vi.fn>).mockResolvedValue({
      path: 'C:\\fake\\picked-image.png',
      previewDataUrl: 'data:image/png;base64,ZmFrZQ=='
    })
    render(<ProductForm submitting={false} error={null} onSubmit={onSubmit} onCancel={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('option', { name: 'Beverages' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Choose Image' }))
    await waitFor(() => expect(screen.getByAltText('Product preview')).toBeInTheDocument())

    await user.type(screen.getByLabelText('Barcode'), '111')
    await user.type(screen.getByLabelText('Name'), 'Coke')
    await user.type(screen.getByLabelText('Price (Baht)'), '20')
    await user.type(screen.getByLabelText('Stock'), '5')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ imageSourcePath: 'C:\\fake\\picked-image.png' })
    )
  })

  it('does nothing when the image picker is cancelled', async () => {
    const user = userEvent.setup()
    ;(window.api.images.pickProductImage as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    render(<ProductForm submitting={false} error={null} onSubmit={vi.fn()} onCancel={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('option', { name: 'Beverages' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Choose Image' }))

    expect(screen.queryByAltText('Product preview')).not.toBeInTheDocument()
  })

  it('shows a Remove Image button when editing a product that already has an image, and removing it sends clearImage: true', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const withImage: ProductRecord = {
      id: '1',
      barcode: '111',
      name: 'Coke',
      priceCents: 2000,
      stock: 10,
      isActive: true,
      categoryId: null,
      imagePath: 'existing.png',
      createdAt: '',
      updatedAt: ''
    }
    render(
      <ProductForm
        initialValues={withImage}
        submitting={false}
        error={null}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    )
    await waitFor(() => expect(screen.getByAltText('Product preview')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Remove Image' }))
    expect(screen.queryByAltText('Product preview')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ clearImage: true }))
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- ProductForm`
Expected: FAIL — no category select, no image picker button exist yet.

- [ ] **Step 3: Implement the `ProductForm` changes**

Add to the imports:

```typescript
import { useCategories } from '../categories/useCategories'
```

Add state (alongside the existing `useState` calls):

```typescript
  const { categories } = useCategories()
  const [categoryId, setCategoryId] = useState(initialValues?.categoryId ?? '')
  const [imageSourcePath, setImageSourcePath] = useState<string | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(
    initialValues?.imagePath ? `app-image://${initialValues.imagePath}` : null
  )
  const [imageCleared, setImageCleared] = useState(false)
```

Add two handlers (alongside `handleSubmit`/`handleBackdropClick`):

```typescript
  async function handlePickImage(): Promise<void> {
    const picked = await window.api.images.pickProductImage()
    if (picked) {
      setImageSourcePath(picked.path)
      setImagePreviewUrl(picked.previewDataUrl)
      setImageCleared(false)
    }
  }

  function handleRemoveImage(): void {
    setImageSourcePath(null)
    setImagePreviewUrl(null)
    setImageCleared(true)
  }
```

In `handleSubmit`, change both `onSubmit({...})` call sites to include the new fields. The editing branch:

```typescript
      onSubmit({
        barcode: barcode.trim(),
        name: name.trim(),
        priceCents,
        stock: stockValue,
        isActive,
        categoryId: categoryId || null,
        ...(imageSourcePath ? { imageSourcePath } : {}),
        ...(imageCleared ? { clearImage: true } : {})
      })
```

The create branch:

```typescript
      onSubmit({
        barcode: barcode.trim(),
        name: name.trim(),
        priceCents,
        stock: stockValue,
        categoryId: categoryId || undefined,
        ...(imageSourcePath ? { imageSourcePath } : {})
      })
```

(Editing sends `categoryId: null` for "no category selected" — an explicit clear, matching `UpdateProductInput`'s undefined-means-unchanged/null-means-clear convention from Task 1. Creating sends `categoryId: undefined` for "no category selected" — there's nothing to "clear" on a brand-new product, so omitting the field entirely is correct there, matching the test in Step 1 that asserts `categoryId: undefined` for the no-selection case. `imageCleared` only ever applies to editing — a new product has no existing image to clear, which is why the create branch doesn't reference it at all.)

Add the category `<select>` to the JSX, right after the existing `.field-row` (Price/Stock) block:

```tsx
          <div className="field">
            <label htmlFor="product-category">Category</label>
            <select
              id="product-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={submitting}
            >
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
```

Add the image picker, right after the category field:

```tsx
          <div className="field">
            <label>Product Image</label>
            <div className="image-picker">
              {imagePreviewUrl && (
                <img
                  src={imagePreviewUrl}
                  alt="Product preview"
                  className="image-picker-preview"
                />
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handlePickImage}
                disabled={submitting}
              >
                Choose Image
              </button>
              {imagePreviewUrl && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleRemoveImage}
                  disabled={submitting}
                >
                  Remove Image
                </button>
              )}
            </div>
          </div>
```

(`imagePreviewUrl` alone is now the single source of truth for "is there an image to show" — it's initialized from `initialValues?.imagePath` when editing a product that already has one, per the `useState` initializer above, so there's no need to separately check `initialValues?.imagePath` again here the way an earlier draft of this step did.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- ProductForm`
Expected: PASS, all tests green (existing tests plus the 7 new ones from Step 1).

- [ ] **Step 5: Add the image-picker CSS**

Append to `src/renderer/src/assets/main.css`:

```css
/* ---- Product image picker ---- */

.image-picker {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.image-picker-preview {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}
```

- [ ] **Step 6: Run the full suite, typecheck, and lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/features/products/ProductForm.tsx src/renderer/src/features/products/ProductForm.test.tsx src/renderer/src/assets/main.css
git commit -m "feat: add category select and image picker to ProductForm"
```

---

### Task 9: `ProductList` thumbnails/category column + `ProductsPage` category filter and Manage Categories

**Files:**
- Modify: `src/renderer/src/features/products/ProductList.tsx`
- Modify: `src/renderer/src/features/products/ProductList.test.tsx` (extend)
- Modify: `src/renderer/src/features/products/ProductsPage.tsx`
- Modify: `src/renderer/src/features/products/ProductsPage.test.tsx` (extend)
- Modify: `src/renderer/src/assets/main.css`

**Interfaces:**
- Consumes: `useCategories` (Task 7); `CategoryManager` (Task 7); `CategoryRecord` from `../../../../shared/category`.
- Produces: nothing new — this is the final integration point for the phase.

- [ ] **Step 1: Extend the failing `ProductList` tests**

Add to `src/renderer/src/features/products/ProductList.test.tsx` (add `import type { CategoryRecord } from '../../../../shared/category'`; `ProductListProps` now requires a `categories` prop, so every existing `render(<ProductList .../>)` call in this file needs `categories={[]}` added — do this for every existing test before adding the new ones below):

```typescript
const beverages: CategoryRecord = { id: '1', name: 'Beverages', createdAt: '', updatedAt: '' }

const productWithCategory: ProductRecord = {
  id: '1',
  barcode: '111',
  name: 'Coke',
  priceCents: 2000,
  stock: 10,
  isActive: true,
  categoryId: '1',
  imagePath: 'abc123.png',
  createdAt: '',
  updatedAt: ''
}

it('shows the category name for a product with a category assigned', () => {
  render(
    <ProductList products={[productWithCategory]} onEdit={vi.fn()} categories={[beverages]} />
  )
  expect(screen.getByText('Beverages')).toBeInTheDocument()
})

it('shows a dash for a product with no category', () => {
  const noCategory = { ...productWithCategory, categoryId: null }
  render(<ProductList products={[noCategory]} onEdit={vi.fn()} categories={[beverages]} />)
  expect(screen.getByText('—')).toBeInTheDocument()
})

it("renders a product's image via the app-image:// protocol", () => {
  render(
    <ProductList products={[productWithCategory]} onEdit={vi.fn()} categories={[beverages]} />
  )
  expect(screen.getByAltText('Coke')).toHaveAttribute('src', 'app-image://abc123.png')
})

it('renders a placeholder for a product with no image', () => {
  const noImage = { ...productWithCategory, imagePath: null }
  render(<ProductList products={[noImage]} onEdit={vi.fn()} categories={[beverages]} />)
  expect(screen.queryByAltText('Coke')).not.toBeInTheDocument()
})
```

(All existing tests in this file need `categories={[]}` added to their `<ProductList .../>` calls to keep compiling and passing — that's a required part of this step, not optional cleanup.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- ProductList`
Expected: FAIL — no `categories` prop accepted yet, no image/category columns rendered.

- [ ] **Step 3: Implement the `ProductList` changes**

Change the imports and props interface from:

```typescript
import type { ProductRecord } from '../../../../shared/product'
import { Money } from '../../../../shared/money'

export interface ProductListProps {
  products: ProductRecord[]
  onEdit: (product: ProductRecord) => void
  query?: string
}
```

to:

```typescript
import type { ProductRecord } from '../../../../shared/product'
import type { CategoryRecord } from '../../../../shared/category'
import { Money } from '../../../../shared/money'

export interface ProductListProps {
  products: ProductRecord[]
  onEdit: (product: ProductRecord) => void
  categories: CategoryRecord[]
  query?: string
}
```

Change the function signature from `function ProductList({ products, onEdit, query }: ProductListProps)` to `function ProductList({ products, onEdit, categories, query }: ProductListProps)`, and add a lookup helper right after the destructure:

```typescript
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]))
```

Add two columns to the `<thead>`, right after the `Barcode` header:

```tsx
          <th>Image</th>
          <th>Category</th>
```

Add the corresponding cells to each `<tr>`, right after the barcode `<td>`:

```tsx
            <td>
              {product.imagePath ? (
                <img
                  src={`app-image://${product.imagePath}`}
                  alt={product.name}
                  className="cell-thumbnail"
                />
              ) : (
                <span className="cell-thumbnail-placeholder" aria-hidden="true" />
              )}
            </td>
            <td>{product.categoryId ? categoryNameById.get(product.categoryId) : '—'}</td>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- ProductList`
Expected: PASS, all tests green.

- [ ] **Step 5: Extend the failing `ProductsPage` tests**

Add to `src/renderer/src/features/products/ProductsPage.test.tsx` (add `categories: { list: vi.fn().mockResolvedValue([beverages]), create: vi.fn(), update: vi.fn(), delete: vi.fn() }` and `images: { pickProductImage: vi.fn() }` to the file's `window.api` mock setup, and the `beverages` fixture, matching the pattern already added in Tasks 7-8's test files):

```typescript
  it('shows a category filter dropdown populated from the categories list', async () => {
    render(<ProductsPage />)
    await waitFor(() => expect(screen.getByRole('option', { name: 'Beverages' })).toBeInTheDocument())
  })

  it('opens the Category Manager modal', async () => {
    const user = userEvent.setup()
    render(<ProductsPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Manage Categories' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Manage Categories' }))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.getByText('Manage Categories')).toBeInTheDocument()
  })

  it('closes the Category Manager modal', async () => {
    const user = userEvent.setup()
    render(<ProductsPage />)
    await user.click(screen.getByRole('button', { name: 'Manage Categories' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npm test -- ProductsPage`
Expected: FAIL — no category filter dropdown, no "Manage Categories" button exist yet.

- [ ] **Step 7: Implement the `ProductsPage` changes**

Add to the imports:

```typescript
import { useCategories } from '../categories/useCategories'
import CategoryManager from '../categories/CategoryManager'
```

Add state and the hook call (alongside the existing ones):

```typescript
  const { categories } = useCategories()
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showCategoryManager, setShowCategoryManager] = useState(false)
```

Add the filtering (this is client-side, over the already-fetched `products` array — matching how the existing search `query` is server-side via `useProducts` while a *category* filter is simpler to apply after the fact since the full list is already in memory):

```typescript
  const filteredProducts = categoryFilter
    ? products.filter((product) => product.categoryId === categoryFilter)
    : products
```

Add the filter dropdown and "Manage Categories" button to the `.products-toolbar` div, after the existing "Add Product" button:

```tsx
          <select
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowCategoryManager(true)}
          >
            Manage Categories
          </button>
```

Change the `<ProductList products={products} onEdit={handleEdit} query={query} />` call to:

```tsx
          <ProductList
            products={filteredProducts}
            onEdit={handleEdit}
            categories={categories}
            query={query}
          />
```

Add the modal render, alongside the existing `{showForm && (...)}` block:

```tsx
      {showCategoryManager && (
        <CategoryManager onClose={() => setShowCategoryManager(false)} />
      )}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test -- ProductsPage`
Expected: PASS, all tests green.

- [ ] **Step 9: Add the thumbnail CSS**

Append to `src/renderer/src/assets/main.css`:

```css
/* ---- Product table thumbnails ---- */

.cell-thumbnail {
  width: 36px;
  height: 36px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  display: block;
}

.cell-thumbnail-placeholder {
  display: block;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  background: var(--color-surface-sunken);
  border: 1px solid var(--color-border);
}
```

- [ ] **Step 10: Run the full suite, lint, and typecheck**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS, no regressions.

- [ ] **Step 11: Manual verification (cannot be automated — see Task 5's note)**

`npm run dev`, then on the Products page: click "Choose Image" in Add Product, pick a real image file, confirm the preview appears; save the product; confirm its thumbnail renders correctly in the table (this is the real, non-mocked proof that `app-image://` actually resolves through Electron's protocol handler — jsdom tests only prove the `<img src>` attribute is correctly *formed*, not that Chromium's networking stack actually *serves* it). Also confirm: editing a product with an existing image shows its current image as the preview; replacing it and saving removes the old file from `dev-product-images/` (or `%APPDATA%/pos/product-images/` in a packaged build) and only the new one remains.

- [ ] **Step 12: Commit**

```bash
git add src/renderer/src/features/products/ProductList.tsx src/renderer/src/features/products/ProductList.test.tsx src/renderer/src/features/products/ProductsPage.tsx src/renderer/src/features/products/ProductsPage.test.tsx src/renderer/src/assets/main.css
git commit -m "feat: add category filter, Manage Categories, and image thumbnails to Products screen"
```

---

## Definition of Done

- `npm test`, `npm run typecheck`, and `npm run lint` all pass with no regressions.
- A shop owner can: create/rename/delete categories (delete blocked while in use); assign a category to a product via a dropdown; upload a local image file for a product, see it previewed before saving, and see it as a thumbnail in the Products table afterward; filter the Products table by category.
- Every new repository function, IPC handler, hook, and component has real test coverage, matching the established standard from Phases 1-6.
- Product images are never referenced from their original picked location — only from this app's own storage, addressed by a filename the app generated.

## What This Phase Doesn't Cover

- **Image resizing/compression** — files are copied as-is; explicitly deferred per the design spec (YAGNI until it's a real problem).
- **Category rename UI** — the hook and repository support it (`updateCategory`), but `CategoryManager`'s UI in this phase only exposes add/delete. A rename control is a small, independent follow-up.
- **Anything from Phase 8 onward** (payment method, POS UX, Sales History, Dashboard) — those are separate phases with their own plans, per `docs/superpowers/specs/2026-09-05-pos-enhancements-design.md`.
