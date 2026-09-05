# Phase 9: POS UX Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a click-to-add product grid, multi-cart Hold/Resume, and a Discount field to the POS checkout screen, per `docs/superpowers/specs/2026-09-05-pos-enhancements-design.md`.

**Architecture:** All four features live entirely inside `src/renderer/src/features/cart/` and touch no schema/IPC surface except the one already opened by Phase 8 (`completeSale`'s `discountCents` parameter, currently hardcoded to `0` by `useCompleteSale.ts` — this phase is what finally sends a real value). The product grid reuses `useProducts()`/`useCategories()` exactly as `ProductsPage` already does, and clicking a tile reuses `useBarcodeScan`'s existing `scan()` function (newly exposed) rather than duplicating its active/stock-check logic — a tile click becomes, from the store's perspective, indistinguishable from typing the same barcode and pressing Enter. Held carts are a second, independent Zustand store (`heldCartsStore.ts`), in-memory only, never persisted to the DB or read by any IPC call — resuming/discarding is pure client-side state surgery orchestrated by `PosPage.tsx`, which is the only place that knows about both the active cart store and the held-carts store.

**Tech Stack:** Same as the rest of the app — React 19 renderer, Zustand, Vitest + React Testing Library. No new dependencies, no schema/IPC changes.

## Global Constraints

- Every write path gets a test in the same task; assert real outcomes against real rendered DOM — no "it didn't throw" tests.
- The renderer never imports `better-sqlite3`/`drizzle-orm`/`electron`'s main-process APIs, or anything under `src/main/**` — everything crosses `window.api`.
- Money is always an integer number of satang through the `Money` class — never raw `+`/`-`/`*` on a `cents` number.
- Clicking a product tile must run through the exact same active/stock checks as scanning its barcode — no separate, potentially-diverging validation path.
- Held carts are in-memory only. Nothing about Hold/Resume/Discard ever touches `window.api` or persists across an app restart.
- Resuming a held cart is rejected (with a message, not a silent merge/overwrite) unless the active cart is currently empty.
- A discount larger than the subtotal is rejected client-side before the payment method modal even opens (the backend already rejects it too, per Phase 8 — this is belt-and-suspenders UX, not the only guard).
- Anything that can change cart contents or the discount amount while `PaymentMethodModal` is open must be disabled while it's open — this is the generalized form of the fix Phase 8's final review already applied to the barcode field (a scan/edit/hold firing between "cashier confirms the amount" and "sale commits" must be impossible, not just for the one control that happened to get caught).

## File Structure

- Modify: `src/renderer/src/features/cart/useBarcodeScan.ts` (+ test) — expose `scan` so a product-tile click can reuse it verbatim.
- Create: `src/renderer/src/features/cart/ProductGrid.tsx` (+ test) — category pills + clickable product tiles.
- Create: `src/renderer/src/features/cart/heldCartsStore.ts` (+ test) — the in-memory held-carts Zustand slice.
- Modify: `src/renderer/src/features/cart/cartStore.ts` (+ test) — add `restoreItems`.
- Create: `src/renderer/src/features/cart/HoldCartModal.tsx` (+ test) — prompts for an optional label.
- Create: `src/renderer/src/features/cart/HeldCartsModal.tsx` (+ test) — lists held carts, Resume/Discard.
- Modify: `src/renderer/src/features/cart/useCompleteSale.ts` (+ test) — `completeSale` gains a `discountCents` parameter (no more hardcoded `0`).
- Modify: `src/renderer/src/features/cart/CartTable.tsx` (+ test) — gains a `disabled` prop.
- Modify: `src/renderer/src/features/cart/PosPage.tsx` (+ test) — wires in the grid, Hold/Held Carts, the discount field + Subtotal/Total breakdown, the generalized "disable while modal open" rule, and the F12 shortcut.
- Modify: `src/renderer/src/assets/main.css` — grid/tile/pill, held-carts-list, and summary-row styles.

---

### Task 1: Click-to-add product grid with category pills

**Files:**
- Modify: `src/renderer/src/features/cart/useBarcodeScan.ts`
- Test: `src/renderer/src/features/cart/useBarcodeScan.test.ts`
- Create: `src/renderer/src/features/cart/ProductGrid.tsx`
- Test: `src/renderer/src/features/cart/ProductGrid.test.tsx`
- Modify: `src/renderer/src/features/cart/PosPage.tsx`
- Test: `src/renderer/src/features/cart/PosPage.test.tsx`
- Modify: `src/renderer/src/assets/main.css`

**Interfaces:**
- Consumes: `useProducts()` (`src/renderer/src/features/products/useProducts.ts`, unchanged, already returns `{ products, loading, error, ... }`), `useCategories()` (`src/renderer/src/features/categories/useCategories.ts`, unchanged), `ProductRecord`/`CategoryRecord` shared types.
- Produces: `useBarcodeScan()`'s result gains `scan: (barcode: string) => Promise<void>`; `ProductGrid` component with props `{ products: ProductRecord[]; categories: CategoryRecord[]; selectedCategoryId: string; onSelectCategory: (categoryId: string) => void; onSelectProduct: (product: ProductRecord) => void; disabled?: boolean }` — Task 3 reuses the `disabled` prop.

- [ ] **Step 1: Write the failing test for exposing `scan`**

Add to `src/renderer/src/features/cart/useBarcodeScan.test.ts`, inside the existing `describe('useBarcodeScan', ...)` block (after the `'adds the scanned product to the cart on Enter and clears the field'` test):

```typescript
  it('exposes scan() directly, for callers that already have a barcode string (e.g. a product-grid tile click)', async () => {
    ;(window.api.products.getByBarcode as ReturnType<typeof vi.fn>).mockResolvedValue(coke)
    const { result } = renderHook(() => useBarcodeScan())

    await act(async () => {
      await result.current.scan('111')
    })

    await waitFor(() => expect(useCartStore.getState().items).toHaveLength(1))
    expect(result.current.error).toBeNull()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/features/cart/useBarcodeScan.test.ts`
Expected: FAIL — `result.current.scan` is `undefined`.

- [ ] **Step 3: Expose `scan`**

In `src/renderer/src/features/cart/useBarcodeScan.ts`, change the `UseBarcodeScanResult` interface from:

```typescript
export interface UseBarcodeScanResult {
  inputRef: React.RefObject<HTMLInputElement | null>
  value: string
  setValue: (value: string) => void
  error: string | null
  handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
  clearError: () => void
}
```

to:

```typescript
export interface UseBarcodeScanResult {
  inputRef: React.RefObject<HTMLInputElement | null>
  value: string
  setValue: (value: string) => void
  error: string | null
  handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
  scan: (barcode: string) => Promise<void>
  clearError: () => void
}
```

and change the final `return` statement from `return { inputRef, value, setValue, error, handleKeyDown, clearError }` to `return { inputRef, value, setValue, error, handleKeyDown, scan, clearError }`. `scan` itself (the `useCallback` already defined in this file) needs no changes — only the export surface changes.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/features/cart/useBarcodeScan.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Write the failing test for `ProductGrid`**

```typescript
// src/renderer/src/features/cart/ProductGrid.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProductGrid from './ProductGrid'
import type { ProductRecord } from '../../../../shared/product'
import type { CategoryRecord } from '../../../../shared/category'

const beverages: CategoryRecord = { id: '1', name: 'Beverages', createdAt: '', updatedAt: '' }
const snacks: CategoryRecord = { id: '2', name: 'Snacks', createdAt: '', updatedAt: '' }

const coke: ProductRecord = {
  id: '1',
  barcode: '111',
  name: 'Coke',
  priceCents: 2000,
  stock: 5,
  isActive: true,
  categoryId: '1',
  imagePath: null,
  createdAt: '',
  updatedAt: ''
}

const chips: ProductRecord = {
  id: '2',
  barcode: '222',
  name: 'Chips',
  priceCents: 3500,
  stock: 0,
  isActive: true,
  categoryId: '2',
  imagePath: 'abc.png',
  createdAt: '',
  updatedAt: ''
}

const inactiveProduct: ProductRecord = {
  id: '3',
  barcode: '333',
  name: 'Discontinued',
  priceCents: 1000,
  stock: 10,
  isActive: false,
  categoryId: null,
  imagePath: null,
  createdAt: '',
  updatedAt: ''
}

describe('ProductGrid', () => {
  it('renders a tile per active product with name and formatted price', () => {
    render(
      <ProductGrid
        products={[coke, chips]}
        categories={[beverages, snacks]}
        selectedCategoryId=""
        onSelectCategory={vi.fn()}
        onSelectProduct={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /Coke/ })).toBeInTheDocument()
    expect(screen.getByText('฿20.00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Chips/ })).toBeInTheDocument()
    expect(screen.getByText('฿35.00')).toBeInTheDocument()
  })

  it('does not render a tile for an inactive product', () => {
    render(
      <ProductGrid
        products={[coke, inactiveProduct]}
        categories={[beverages]}
        selectedCategoryId=""
        onSelectCategory={vi.fn()}
        onSelectProduct={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: /Discontinued/ })).not.toBeInTheDocument()
  })

  it('renders an "All" pill plus one pill per category', () => {
    render(
      <ProductGrid
        products={[coke, chips]}
        categories={[beverages, snacks]}
        selectedCategoryId=""
        onSelectCategory={vi.fn()}
        onSelectProduct={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Beverages' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Snacks' })).toBeInTheDocument()
  })

  it('calls onSelectCategory with the category id when a pill is clicked, and with an empty string for "All"', async () => {
    const user = userEvent.setup()
    const onSelectCategory = vi.fn()
    render(
      <ProductGrid
        products={[coke]}
        categories={[beverages]}
        selectedCategoryId=""
        onSelectCategory={onSelectCategory}
        onSelectProduct={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Beverages' }))
    expect(onSelectCategory).toHaveBeenCalledWith('1')

    await user.click(screen.getByRole('button', { name: 'All' }))
    expect(onSelectCategory).toHaveBeenCalledWith('')
  })

  it('only shows products in the selected category', () => {
    render(
      <ProductGrid
        products={[coke, chips]}
        categories={[beverages, snacks]}
        selectedCategoryId="1"
        onSelectCategory={vi.fn()}
        onSelectProduct={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /Coke/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Chips/ })).not.toBeInTheDocument()
  })

  it('shows an empty message when the selected category has no products', () => {
    render(
      <ProductGrid
        products={[coke]}
        categories={[beverages, snacks]}
        selectedCategoryId="2"
        onSelectCategory={vi.fn()}
        onSelectProduct={vi.fn()}
      />
    )

    expect(screen.getByText('No products in this category.')).toBeInTheDocument()
  })

  it('calls onSelectProduct with the product when an in-stock tile is clicked', async () => {
    const user = userEvent.setup()
    const onSelectProduct = vi.fn()
    render(
      <ProductGrid
        products={[coke]}
        categories={[beverages]}
        selectedCategoryId=""
        onSelectCategory={vi.fn()}
        onSelectProduct={onSelectProduct}
      />
    )

    await user.click(screen.getByRole('button', { name: /Coke/ }))
    expect(onSelectProduct).toHaveBeenCalledWith(coke)
  })

  it('disables an out-of-stock tile and shows an out-of-stock label', () => {
    render(
      <ProductGrid
        products={[chips]}
        categories={[snacks]}
        selectedCategoryId=""
        onSelectCategory={vi.fn()}
        onSelectProduct={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /Chips/ })).toBeDisabled()
    expect(screen.getByText('Out of stock')).toBeInTheDocument()
  })

  it('disables every tile when disabled is true', () => {
    render(
      <ProductGrid
        products={[coke]}
        categories={[beverages]}
        selectedCategoryId=""
        onSelectCategory={vi.fn()}
        onSelectProduct={vi.fn()}
        disabled
      />
    )

    expect(screen.getByRole('button', { name: /Coke/ })).toBeDisabled()
  })

  it("renders a product's image via the app-image:// protocol, or a placeholder when it has none", () => {
    render(
      <ProductGrid
        products={[chips, coke]}
        categories={[beverages, snacks]}
        selectedCategoryId=""
        onSelectCategory={vi.fn()}
        onSelectProduct={vi.fn()}
      />
    )

    expect(screen.getByAltText('Chips')).toHaveAttribute('src', 'app-image://abc.png')
    expect(screen.queryByAltText('Coke')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/features/cart/ProductGrid.test.tsx`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 7: Implement `ProductGrid`**

```typescript
// src/renderer/src/features/cart/ProductGrid.tsx
import type { ProductRecord } from '../../../../shared/product'
import type { CategoryRecord } from '../../../../shared/category'
import { Money } from '../../../../shared/money'

export interface ProductGridProps {
  products: ProductRecord[]
  categories: CategoryRecord[]
  selectedCategoryId: string
  onSelectCategory: (categoryId: string) => void
  onSelectProduct: (product: ProductRecord) => void
  disabled?: boolean
}

function ProductGrid({
  products,
  categories,
  selectedCategoryId,
  onSelectCategory,
  onSelectProduct,
  disabled
}: ProductGridProps): React.JSX.Element {
  const activeProducts = products.filter((product) => product.isActive)
  const visibleProducts = selectedCategoryId
    ? activeProducts.filter((product) => product.categoryId === selectedCategoryId)
    : activeProducts

  return (
    <div className="product-grid-panel">
      <div className="category-pills" role="tablist" aria-label="Filter products by category">
        <button
          type="button"
          className={`category-pill${selectedCategoryId === '' ? ' is-active' : ''}`}
          onClick={() => onSelectCategory('')}
        >
          All
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className={`category-pill${selectedCategoryId === category.id ? ' is-active' : ''}`}
            onClick={() => onSelectCategory(category.id)}
          >
            {category.name}
          </button>
        ))}
      </div>

      {visibleProducts.length === 0 ? (
        <p className="product-grid-empty">No products in this category.</p>
      ) : (
        <div className="product-grid">
          {visibleProducts.map((product) => (
            <button
              key={product.id}
              type="button"
              className="product-tile"
              onClick={() => onSelectProduct(product)}
              disabled={disabled || product.stock < 1}
            >
              {product.imagePath ? (
                <img
                  src={`app-image://${product.imagePath}`}
                  alt={product.name}
                  className="product-tile-image"
                />
              ) : (
                <span className="product-tile-image-placeholder" aria-hidden="true" />
              )}
              <span className="product-tile-name">{product.name}</span>
              <span className="product-tile-price">
                {Money.fromCents(product.priceCents).format()}
              </span>
              {product.stock < 1 && <span className="product-tile-out-of-stock">Out of stock</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default ProductGrid
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/features/cart/ProductGrid.test.tsx`
Expected: PASS.

- [ ] **Step 9: Add CSS**

Add to `src/renderer/src/assets/main.css` (anywhere near the other cart/POS rules, e.g. right after `.pos-footer`):

```css
.category-pills {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.category-pill {
  padding: 6px var(--space-3);
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-ink-muted);
  cursor: pointer;
}

.category-pill.is-active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.product-grid-panel {
  margin-bottom: var(--space-4);
}

.product-grid-empty {
  color: var(--color-ink-faint);
  font-size: 14px;
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: var(--space-3);
}

.product-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  cursor: pointer;
  text-align: center;
}

.product-tile:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.product-tile-image,
.product-tile-image-placeholder {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface-sunken);
}

.product-tile-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-ink);
}

.product-tile-price {
  font-size: 13px;
  color: var(--color-ink-muted);
}

.product-tile-out-of-stock {
  font-size: 12px;
  color: var(--color-danger);
}
```

(`--color-danger` is the same variable `.alert-danger` already uses for its text color, in this same file.)

- [ ] **Step 10: Disambiguate every existing cart-content text check against the incoming product grid**

Once the grid lands (this task), every product it shows renders that product's name as its own visible text (e.g. "Coke" on a tile) — which will now collide with `CartTable`'s `<td>{item.name}</td>` cell, since both are exact text nodes reading "Coke", and `screen.getByText('Coke')` throws once more than one element matches. This is the exact same category of collision `ProductList.test.tsx` already hit once (a table cell vs. a dropdown option both reading "Beverages") and already fixed the same way — `screen.getByRole('cell', { name: ... })`, which matches only the table cell.

In `src/renderer/src/features/cart/PosPage.test.tsx`, replace every occurrence of `screen.getByText('Coke')` with `screen.getByRole('cell', { name: 'Coke' })` — there are 12 occurrences across the existing tests (in `'adds a scanned product...'`, `'increments the total...'`, `'clears the cart...'`, `"reconciles a cart line's stock..."`, `'opens the payment method modal, then completes the sale...'`, `'closes the payment method modal without completing...'` (two occurrences), `'shows an error and keeps the cart...'` (two occurrences), `'clears a stale sale-rejection banner...'`, and `'hides a previous success message...'`). No other change to any of these tests — only the query itself changes, and every one of them still awaits the exact same condition it did before.

- [ ] **Step 11: Write the failing test for wiring the grid into `PosPage`**

Add to `src/renderer/src/features/cart/PosPage.test.tsx`'s `beforeEach` mock, add `categories` and extend `products`:

```typescript
    window.api = {
      dbHealth: vi.fn(),
      products: {
        list: vi.fn().mockResolvedValue([coke]),
        create: vi.fn(),
        update: vi.fn(),
        getByBarcode: vi.fn().mockResolvedValue(coke)
      },
      categories: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      },
      sales: {
        complete: vi.fn()
      }
    } as unknown as Window['api']
```

(This replaces the existing `beforeEach`'s `window.api` assignment — every other field stays exactly as it already is; only `products.list` and the new `categories` block are added.)

Add these two new tests to the `describe('PosPage', ...)` block:

```typescript
  it('renders a clickable product grid populated from the products list', async () => {
    render(<PosPage />)

    await waitFor(() => expect(screen.getByRole('button', { name: /Coke/ })).toBeInTheDocument())
  })

  it('clicking a product tile adds it to the cart, exactly like scanning its barcode', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await waitFor(() => expect(screen.getByRole('button', { name: /Coke/ })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Coke/ }))

    await waitFor(() => expect(screen.getByLabelText('Cart total')).toHaveTextContent('฿20.00'))
  })
```

- [ ] **Step 12: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/features/cart/PosPage.test.tsx`
Expected: FAIL — no grid exists in `PosPage` yet.

- [ ] **Step 13: Wire `ProductGrid` into `PosPage`**

Change the top of `src/renderer/src/features/cart/PosPage.tsx` from:

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
```

to:

```typescript
import { useEffect, useState } from 'react'
import { useCartStore, cartTotalCents } from './cartStore'
import { useBarcodeScan } from './useBarcodeScan'
import { useCompleteSale } from './useCompleteSale'
import CartTable from './CartTable'
import ProductGrid from './ProductGrid'
import PaymentMethodModal from './PaymentMethodModal'
import { useProducts } from '../products/useProducts'
import { useCategories } from '../categories/useCategories'
import { Money } from '../../../../shared/money'
import type { PaymentMethod } from '../../../../shared/sale'
import type { ProductRecord } from '../../../../shared/product'

function PosPage(): React.JSX.Element {
  const items = useCartStore((state) => state.items)
  const incrementItem = useCartStore((state) => state.incrementItem)
  const decrementItem = useCartStore((state) => state.decrementItem)
  const removeItem = useCartStore((state) => state.removeItem)
  const clear = useCartStore((state) => state.clear)
  const { inputRef, value, setValue, error, handleKeyDown, scan, clearError } = useBarcodeScan()
  const { products } = useProducts()
  const { categories } = useCategories()
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
```

Add a handler right after `handleFinishSaleClick`'s current position (exact placement inside the component doesn't matter — place it near the other handlers):

```typescript
  async function handleSelectProductTile(product: ProductRecord): Promise<void> {
    await scan(product.barcode)
  }
```

Add the grid to the JSX, right after the `.scan-field` div and before the `{(error || saleError) && ...}` block:

```typescript
      <ProductGrid
        products={products}
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        onSelectCategory={setSelectedCategoryId}
        onSelectProduct={handleSelectProductTile}
      />
```

- [ ] **Step 14: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/features/cart/PosPage.test.tsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 15: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS — this task's changes are additive and don't touch any signature a later task depends on differently.

- [ ] **Step 16: Commit**

```bash
git add src/renderer/src/features/cart/useBarcodeScan.ts src/renderer/src/features/cart/useBarcodeScan.test.ts src/renderer/src/features/cart/ProductGrid.tsx src/renderer/src/features/cart/ProductGrid.test.tsx src/renderer/src/features/cart/PosPage.tsx src/renderer/src/features/cart/PosPage.test.tsx src/renderer/src/assets/main.css
git commit -m "feat: add click-to-add product grid with category pills to POS"
```

---

### Task 2: Hold and resume multiple carts

**Files:**
- Create: `src/renderer/src/features/cart/heldCartsStore.ts`
- Test: `src/renderer/src/features/cart/heldCartsStore.test.ts`
- Modify: `src/renderer/src/features/cart/cartStore.ts`
- Test: `src/renderer/src/features/cart/cartStore.test.ts`
- Create: `src/renderer/src/features/cart/HoldCartModal.tsx`
- Test: `src/renderer/src/features/cart/HoldCartModal.test.tsx`
- Create: `src/renderer/src/features/cart/HeldCartsModal.tsx`
- Test: `src/renderer/src/features/cart/HeldCartsModal.test.tsx`
- Modify: `src/renderer/src/features/cart/PosPage.tsx`
- Test: `src/renderer/src/features/cart/PosPage.test.tsx`
- Modify: `src/renderer/src/assets/main.css`

**Interfaces:**
- Consumes: `CartItem` from `./cartStore` (Task 1's file, unchanged shape); `cartTotalCents` from `./cartStore` (unchanged).
- Produces: `heldCartsStore.ts`'s `HeldCart { id: string; label: string | null; items: CartItem[]; heldAt: string }` and `useHeldCartsStore()` returning `{ heldCarts: HeldCart[]; hold: (items: CartItem[], label: string) => void; discard: (id: string) => void }`; `cartStore.ts`'s `CartState` gains `restoreItems: (items: CartItem[]) => void`; `HoldCartModal` props `{ onHold: (label: string) => void; onCancel: () => void }`; `HeldCartsModal` props `{ heldCarts: HeldCart[]; error: string | null; onResume: (id: string) => void; onDiscard: (id: string) => void; onClose: () => void }` — Task 3 reads `heldCarts.length` to gate the Hold/Held-Carts buttons alongside the payment modal.

- [ ] **Step 1: Write the failing test for `heldCartsStore`**

```typescript
// src/renderer/src/features/cart/heldCartsStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useHeldCartsStore } from './heldCartsStore'
import type { CartItem } from './cartStore'

const coke: CartItem = {
  productId: '1',
  barcode: '111',
  name: 'Coke',
  unitPriceCents: 2000,
  stock: 5,
  quantity: 2
}

describe('heldCartsStore', () => {
  beforeEach(() => {
    useHeldCartsStore.setState({ heldCarts: [] })
  })

  it('holds a cart with a trimmed label', () => {
    useHeldCartsStore.getState().hold([coke], '  Table 4  ')

    const held = useHeldCartsStore.getState().heldCarts
    expect(held).toHaveLength(1)
    expect(held[0].label).toBe('Table 4')
    expect(held[0].items).toEqual([coke])
    expect(held[0].id).toBeDefined()
    expect(held[0].heldAt).toBeDefined()
  })

  it('holds a cart with a null label when no label is given', () => {
    useHeldCartsStore.getState().hold([coke], '')

    expect(useHeldCartsStore.getState().heldCarts[0].label).toBeNull()
  })

  it('holds a cart with a null label when the label is only whitespace', () => {
    useHeldCartsStore.getState().hold([coke], '   ')

    expect(useHeldCartsStore.getState().heldCarts[0].label).toBeNull()
  })

  it('holds multiple carts independently', () => {
    useHeldCartsStore.getState().hold([coke], 'First')
    useHeldCartsStore.getState().hold([coke], 'Second')

    expect(useHeldCartsStore.getState().heldCarts).toHaveLength(2)
    expect(useHeldCartsStore.getState().heldCarts.map((h) => h.label)).toEqual(['First', 'Second'])
  })

  it('discards a held cart by id', () => {
    useHeldCartsStore.getState().hold([coke], 'First')
    const id = useHeldCartsStore.getState().heldCarts[0].id

    useHeldCartsStore.getState().discard(id)

    expect(useHeldCartsStore.getState().heldCarts).toHaveLength(0)
  })

  it('does nothing when discarding an id that does not exist', () => {
    useHeldCartsStore.getState().hold([coke], 'First')

    useHeldCartsStore.getState().discard('does-not-exist')

    expect(useHeldCartsStore.getState().heldCarts).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/features/cart/heldCartsStore.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement `heldCartsStore`**

```typescript
// src/renderer/src/features/cart/heldCartsStore.ts
import { create } from 'zustand'
import type { CartItem } from './cartStore'

export interface HeldCart {
  id: string
  label: string | null
  items: CartItem[]
  heldAt: string
}

interface HeldCartsState {
  heldCarts: HeldCart[]
  hold: (items: CartItem[], label: string) => void
  discard: (id: string) => void
}

export const useHeldCartsStore = create<HeldCartsState>((set, get) => ({
  heldCarts: [],

  hold: (items, label) => {
    const trimmed = label.trim()
    set({
      heldCarts: [
        ...get().heldCarts,
        {
          id: crypto.randomUUID(),
          label: trimmed.length > 0 ? trimmed : null,
          items,
          heldAt: new Date().toISOString()
        }
      ]
    })
  },

  discard: (id) => {
    set({ heldCarts: get().heldCarts.filter((held) => held.id !== id) })
  }
}))
```

(`crypto.randomUUID()` is the standard Web Crypto API global, available in the Electron renderer without any import — the same category of browser-native API `Money`/`cartStore` already assume, not a Node API. Never import `node:crypto` here — the renderer must never import anything under `src/main/**` or a Node builtin that main-process code uses.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/features/cart/heldCartsStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `cartStore.restoreItems`**

Add to `src/renderer/src/features/cart/cartStore.test.ts`, inside the existing `describe('useCartStore', ...)` block — e.g. right after the `'clear empties the cart'` test:

```typescript
  it('restoreItems replaces the entire cart with the given items', () => {
    useCartStore.setState({
      items: [
        { productId: '1', barcode: '111', name: 'Coke', unitPriceCents: 2000, stock: 5, quantity: 1 }
      ]
    })

    const restored = [
      { productId: '2', barcode: '222', name: 'Water', unitPriceCents: 1000, stock: 3, quantity: 2 }
    ]
    useCartStore.getState().restoreItems(restored)

    expect(useCartStore.getState().items).toEqual(restored)
  })
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/features/cart/cartStore.test.ts`
Expected: FAIL — `restoreItems` doesn't exist yet.

- [ ] **Step 7: Add `restoreItems`**

In `src/renderer/src/features/cart/cartStore.ts`, add `restoreItems: (items: CartItem[]) => void` to the `CartState` interface (anywhere in the list, e.g. right after `clear: () => void`), and add the implementation to the `create<CartState>((set, get) => ({...}))` object, right after the existing `clear: () => set({ items: [] }),` line:

```typescript
  restoreItems: (items) => set({ items }),
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/features/cart/cartStore.test.ts`
Expected: PASS.

- [ ] **Step 9: Write the failing test for `HoldCartModal`**

```typescript
// src/renderer/src/features/cart/HoldCartModal.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HoldCartModal from './HoldCartModal'

describe('HoldCartModal', () => {
  it('calls onHold with the typed label when the form is submitted', async () => {
    const user = userEvent.setup()
    const onHold = vi.fn()
    render(<HoldCartModal onHold={onHold} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText('Label (optional)'), 'Table 4')
    await user.click(screen.getByRole('button', { name: 'Hold' }))

    expect(onHold).toHaveBeenCalledWith('Table 4')
  })

  it('calls onHold with an empty string when no label is typed', async () => {
    const user = userEvent.setup()
    const onHold = vi.fn()
    render(<HoldCartModal onHold={onHold} onCancel={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Hold' }))

    expect(onHold).toHaveBeenCalledWith('')
  })

  it('calls onCancel when the Cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<HoldCartModal onHold={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<HoldCartModal onHold={vi.fn()} onCancel={onCancel} />)

    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when the backdrop is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<HoldCartModal onHold={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole('dialog').parentElement as HTMLElement)

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not call onCancel when clicking inside the dialog panel', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<HoldCartModal onHold={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole('dialog'))

    expect(onCancel).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/features/cart/HoldCartModal.test.tsx`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 11: Implement `HoldCartModal`**

```typescript
// src/renderer/src/features/cart/HoldCartModal.tsx
import { useEffect, useState } from 'react'

export interface HoldCartModalProps {
  onHold: (label: string) => void
  onCancel: () => void
}

function HoldCartModal({ onHold, onCancel }: HoldCartModalProps): React.JSX.Element {
  const [label, setLabel] = useState('')

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) {
      onCancel()
    }
  }

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault()
    onHold(label)
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hold-cart-title"
      >
        <form onSubmit={handleSubmit}>
          <h2 id="hold-cart-title">Hold Cart</h2>
          <div className="field">
            <label htmlFor="hold-cart-label">Label (optional)</label>
            <input
              id="hold-cart-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Hold
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default HoldCartModal
```

(No `submitting`/disabled-guard state here, unlike `PaymentMethodModal`/`ProductForm` — holding a cart is a synchronous, purely in-memory Zustand write with no `await`, so there is no in-flight window to guard against.)

- [ ] **Step 12: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/features/cart/HoldCartModal.test.tsx`
Expected: PASS.

- [ ] **Step 13: Write the failing test for `HeldCartsModal`**

```typescript
// src/renderer/src/features/cart/HeldCartsModal.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HeldCartsModal from './HeldCartsModal'
import type { HeldCart } from './heldCartsStore'

const held: HeldCart = {
  id: 'held-1',
  label: 'Table 4',
  items: [
    { productId: '1', barcode: '111', name: 'Coke', unitPriceCents: 2000, stock: 5, quantity: 2 }
  ],
  heldAt: '2026-09-05T10:00:00.000Z'
}

const untitledHeld: HeldCart = {
  id: 'held-2',
  label: null,
  items: [],
  heldAt: '2026-09-05T10:05:00.000Z'
}

describe('HeldCartsModal', () => {
  it('shows a message when there are no held carts', () => {
    render(
      <HeldCartsModal heldCarts={[]} error={null} onResume={vi.fn()} onDiscard={vi.fn()} onClose={vi.fn()} />
    )
    expect(screen.getByText('No held carts.')).toBeInTheDocument()
  })

  it("shows each held cart's label, item count, and total", () => {
    render(
      <HeldCartsModal
        heldCarts={[held]}
        error={null}
        onResume={vi.fn()}
        onDiscard={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Table 4')).toBeInTheDocument()
    expect(screen.getByText(/2 item\(s\)/)).toBeInTheDocument()
    expect(screen.getByText(/฿40\.00/)).toBeInTheDocument()
  })

  it('shows "Untitled" for a held cart with no label', () => {
    render(
      <HeldCartsModal
        heldCarts={[untitledHeld]}
        error={null}
        onResume={vi.fn()}
        onDiscard={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Untitled')).toBeInTheDocument()
  })

  it('calls onResume with the held cart id when Resume is clicked', async () => {
    const user = userEvent.setup()
    const onResume = vi.fn()
    render(
      <HeldCartsModal
        heldCarts={[held]}
        error={null}
        onResume={onResume}
        onDiscard={vi.fn()}
        onClose={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Resume' }))
    expect(onResume).toHaveBeenCalledWith('held-1')
  })

  it('calls onDiscard with the held cart id when Discard is clicked', async () => {
    const user = userEvent.setup()
    const onDiscard = vi.fn()
    render(
      <HeldCartsModal
        heldCarts={[held]}
        error={null}
        onResume={vi.fn()}
        onDiscard={onDiscard}
        onClose={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onDiscard).toHaveBeenCalledWith('held-1')
  })

  it('shows an error message when one is given', () => {
    render(
      <HeldCartsModal
        heldCarts={[held]}
        error="Finish, clear, or hold your current cart before resuming a held one."
        onResume={vi.fn()}
        onDiscard={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Finish, clear, or hold your current cart before resuming a held one.'
    )
  })

  it('calls onClose when the Close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <HeldCartsModal heldCarts={[]} error={null} onResume={vi.fn()} onDiscard={vi.fn()} onClose={onClose} />
    )

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 14: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/features/cart/HeldCartsModal.test.tsx`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 15: Implement `HeldCartsModal`**

```typescript
// src/renderer/src/features/cart/HeldCartsModal.tsx
import type { HeldCart } from './heldCartsStore'
import { Money } from '../../../../shared/money'
import { cartTotalCents } from './cartStore'

export interface HeldCartsModalProps {
  heldCarts: HeldCart[]
  error: string | null
  onResume: (id: string) => void
  onDiscard: (id: string) => void
  onClose: () => void
}

function HeldCartsModal({
  heldCarts,
  error,
  onResume,
  onDiscard,
  onClose
}: HeldCartsModalProps): React.JSX.Element {
  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="held-carts-title"
      >
        <h2 id="held-carts-title">Held Carts</h2>

        {error && (
          <p role="alert" className="alert alert-danger">
            {error}
          </p>
        )}

        {heldCarts.length === 0 ? (
          <p>No held carts.</p>
        ) : (
          <ul className="held-carts-list">
            {heldCarts.map((held) => (
              <li key={held.id}>
                <div className="held-cart-info">
                  <span className="held-cart-label">{held.label ?? 'Untitled'}</span>
                  <span className="held-cart-meta">
                    {held.items.length} item(s) — {Money.fromCents(cartTotalCents(held.items)).format()}
                  </span>
                </div>
                <button type="button" className="btn btn-primary" onClick={() => onResume(held.id)}>
                  Resume
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => onDiscard(held.id)}>
                  Discard
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default HeldCartsModal
```

- [ ] **Step 16: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/features/cart/HeldCartsModal.test.tsx`
Expected: PASS.

- [ ] **Step 17: Add CSS**

Add to `src/renderer/src/assets/main.css`, right after the `.product-tile-out-of-stock` rule added in Task 1:

```css
.held-carts-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-height: 240px;
  overflow-y: auto;
}

.held-carts-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
}

.held-cart-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.held-cart-label {
  font-weight: 600;
  color: var(--color-ink);
}

.held-cart-meta {
  font-size: 13px;
  color: var(--color-ink-muted);
}
```

- [ ] **Step 18: Write the failing test for wiring Hold/Held Carts into `PosPage`**

Add these tests to `src/renderer/src/features/cart/PosPage.test.tsx`'s `describe('PosPage', ...)` block:

```typescript
  it('holds the current cart and clears it, via the Hold Cart modal', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Hold' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.type(screen.getByLabelText('Label (optional)'), 'Table 4')
    await user.click(screen.getByRole('button', { name: 'Hold' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Cart is empty')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Held Carts (1)' })).toBeInTheDocument()
  })

  it('resumes a held cart into the (empty) active cart', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Hold' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Hold' }))
    await waitFor(() => expect(screen.getByText('Cart is empty')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Held Carts (1)' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Resume' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Held Carts (0)' })).toBeInTheDocument()
  })

  it('rejects resuming a held cart while the active cart is not empty', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    // Hold one cart with Coke in it.
    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Hold' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Hold' }))
    await waitFor(() => expect(screen.getByText('Cart is empty')).toBeInTheDocument())

    // Start a new active cart.
    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Held Carts (1)' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Resume' }))

    expect(
      screen.getByText('Finish, clear, or hold your current cart before resuming a held one.')
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Held Carts (1)' })).toBeInTheDocument()
  })

  it('discards a held cart', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Hold' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Hold' }))
    await waitFor(() => expect(screen.getByText('Cart is empty')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Held Carts (1)' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Discard' }))

    expect(screen.getByText('No held carts.')).toBeInTheDocument()
  })

  it('closes the Hold Cart modal without holding when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Hold' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument()
  })
```

- [ ] **Step 19: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/features/cart/PosPage.test.tsx`
Expected: FAIL — no Hold/Held Carts buttons exist in `PosPage` yet.

- [ ] **Step 20: Wire Hold/Resume/Discard into `PosPage`**

Add to the import block at the top of `src/renderer/src/features/cart/PosPage.tsx`:

```typescript
import { useHeldCartsStore } from './heldCartsStore'
import HoldCartModal from './HoldCartModal'
import HeldCartsModal from './HeldCartsModal'
```

Add state and derived values inside the component (near the existing `useState` calls):

```typescript
  const heldCarts = useHeldCartsStore((state) => state.heldCarts)
  const holdCart = useHeldCartsStore((state) => state.hold)
  const discardHeldCart = useHeldCartsStore((state) => state.discard)
  const restoreItems = useCartStore((state) => state.restoreItems)
  const [showHoldModal, setShowHoldModal] = useState(false)
  const [showHeldCartsModal, setShowHeldCartsModal] = useState(false)
  const [heldCartsError, setHeldCartsError] = useState<string | null>(null)
```

Add handlers (near the other handlers):

```typescript
  function handleHoldClick(): void {
    setShowHoldModal(true)
  }

  function handleHoldConfirm(label: string): void {
    holdCart(items, label)
    clear()
    setShowHoldModal(false)
  }

  function handleHoldCancel(): void {
    setShowHoldModal(false)
  }

  function handleShowHeldCarts(): void {
    setHeldCartsError(null)
    setShowHeldCartsModal(true)
  }

  function handleResumeHeldCart(id: string): void {
    if (items.length > 0) {
      setHeldCartsError('Finish, clear, or hold your current cart before resuming a held one.')
      return
    }
    const held = heldCarts.find((heldCart) => heldCart.id === id)
    if (!held) {
      return
    }
    restoreItems(held.items)
    discardHeldCart(id)
    setShowHeldCartsModal(false)
  }

  function handleDiscardHeldCart(id: string): void {
    discardHeldCart(id)
  }

  function handleCloseHeldCarts(): void {
    setShowHeldCartsModal(false)
  }
```

Add the two buttons to `.pos-footer`, right before the existing "Clear Cart" button:

```typescript
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleHoldClick}
          disabled={items.length === 0 || completing}
        >
          Hold
        </button>
        <button type="button" className="btn btn-secondary" onClick={handleShowHeldCarts}>
          {`Held Carts (${heldCarts.length})`}
        </button>
```

Add the two modals at the bottom of the JSX, right after `PaymentMethodModal`'s conditional render:

```typescript
      {showHoldModal && <HoldCartModal onHold={handleHoldConfirm} onCancel={handleHoldCancel} />}
      {showHeldCartsModal && (
        <HeldCartsModal
          heldCarts={heldCarts}
          error={heldCartsError}
          onResume={handleResumeHeldCart}
          onDiscard={handleDiscardHeldCart}
          onClose={handleCloseHeldCarts}
        />
      )}
```

- [ ] **Step 21: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/features/cart/PosPage.test.tsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 22: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 23: Commit**

```bash
git add src/renderer/src/features/cart/heldCartsStore.ts src/renderer/src/features/cart/heldCartsStore.test.ts src/renderer/src/features/cart/cartStore.ts src/renderer/src/features/cart/cartStore.test.ts src/renderer/src/features/cart/HoldCartModal.tsx src/renderer/src/features/cart/HoldCartModal.test.tsx src/renderer/src/features/cart/HeldCartsModal.tsx src/renderer/src/features/cart/HeldCartsModal.test.tsx src/renderer/src/features/cart/PosPage.tsx src/renderer/src/features/cart/PosPage.test.tsx src/renderer/src/assets/main.css
git commit -m "feat: add Hold/Resume/Discard for multiple concurrent carts"
```

---

### Task 3: Discount field, Subtotal/Total breakdown, and generalized modal-open lockout

**Files:**
- Modify: `src/renderer/src/features/cart/useCompleteSale.ts`
- Test: `src/renderer/src/features/cart/useCompleteSale.test.ts`
- Modify: `src/renderer/src/features/cart/CartTable.tsx`
- Test: `src/renderer/src/features/cart/CartTable.test.tsx`
- Modify: `src/renderer/src/features/cart/PosPage.tsx`
- Test: `src/renderer/src/features/cart/PosPage.test.tsx`
- Modify: `src/renderer/src/assets/main.css`

**Interfaces:**
- Consumes: `window.api.sales.complete(items, paymentMethod, discountCents)` (Phase 8, unchanged); `Money.parseBaht`/`Money.fromCents` (unchanged).
- Produces: `useCompleteSale()`'s `completeSale` becomes `(paymentMethod: PaymentMethod, discountCents: number) => Promise<SaleRecord | null>`; `CartTable` gains a `disabled?: boolean` prop.

- [ ] **Step 1: Write the failing test for `completeSale`'s new parameter**

In `src/renderer/src/features/cart/useCompleteSale.test.ts`, change every `result.current.completeSale('CASH')` call to `result.current.completeSale('CASH', 0)` (five call sites: the main success test, the empty-cart test, the error test, the in-flight test, the clearError test), and change the main success test's assertion from:

```typescript
    expect(window.api.sales.complete).toHaveBeenCalledWith(
      [{ productId: '1', productName: 'Coke', unitPriceCents: 2000, quantity: 2 }],
      'CASH',
      0
    )
```

to (unchanged text, this assertion already expects the `0` — no edit needed here; only the `completeSale(...)` call sites themselves need the second argument added). Then add a new test, right after that main success test:

```typescript
  it('sends a nonzero discount through to window.api.sales.complete', async () => {
    useCartStore.setState({ items: [coke] })
    const sale: SaleRecord = {
      id: 'sale-1',
      totalCents: 3500,
      status: 'COMPLETED',
      paymentMethod: 'CASH',
      discountCents: 500,
      createdAt: '2026-09-03T00:00:00.000Z',
      items: []
    }
    ;(window.api.sales.complete as ReturnType<typeof vi.fn>).mockResolvedValue(sale)

    const { result } = renderHook(() => useCompleteSale())

    await act(async () => {
      await result.current.completeSale('CASH', 500)
    })

    expect(window.api.sales.complete).toHaveBeenCalledWith(
      [{ productId: '1', productName: 'Coke', unitPriceCents: 2000, quantity: 2 }],
      'CASH',
      500
    )
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/features/cart/useCompleteSale.test.ts`
Expected: FAIL — `completeSale` only accepts one argument today; the hardcoded `0` in the implementation ignores anything passed for discount.

- [ ] **Step 3: Implement the new parameter**

Change `src/renderer/src/features/cart/useCompleteSale.ts` from:

```typescript
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
```

to:

```typescript
export interface UseCompleteSaleResult {
  completing: boolean
  error: string | null
  completeSale: (paymentMethod: PaymentMethod, discountCents: number) => Promise<SaleRecord | null>
  clearError: () => void
}

export function useCompleteSale(): UseCompleteSaleResult {
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const completeSale = useCallback(
    async (paymentMethod: PaymentMethod, discountCents: number): Promise<SaleRecord | null> => {
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
        const sale = await window.api.sales.complete(lines, paymentMethod, discountCents)
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/features/cart/useCompleteSale.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Write the failing test for `CartTable`'s `disabled` prop**

Add to `src/renderer/src/features/cart/CartTable.test.tsx`:

```typescript
  it('disables every increment/decrement/remove button when disabled is true', () => {
    render(
      <CartTable
        items={items}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onRemove={vi.fn()}
        disabled
      />
    )

    expect(screen.getByLabelText('Increase quantity of Coke')).toBeDisabled()
    expect(screen.getByLabelText('Decrease quantity of Coke')).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'Remove' })[0]).toBeDisabled()
  })
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/features/cart/CartTable.test.tsx`
Expected: FAIL — `CartTable` has no `disabled` prop yet, so nothing is disabled.

- [ ] **Step 7: Add the `disabled` prop**

Change `src/renderer/src/features/cart/CartTable.tsx`'s props interface and signature from:

```typescript
export interface CartTableProps {
  items: CartItem[]
  onIncrement: (productId: string) => void
  onDecrement: (productId: string) => void
  onRemove: (productId: string) => void
}
```

```typescript
function CartTable({ items, onIncrement, onDecrement, onRemove }: CartTableProps): React.JSX.Element {
```

to:

```typescript
export interface CartTableProps {
  items: CartItem[]
  onIncrement: (productId: string) => void
  onDecrement: (productId: string) => void
  onRemove: (productId: string) => void
  disabled?: boolean
}
```

```typescript
function CartTable({
  items,
  onIncrement,
  onDecrement,
  onRemove,
  disabled
}: CartTableProps): React.JSX.Element {
```

Then change each of the three buttons' `disabled` attribute:

- The decrement button: `disabled={item.quantity <= 1}` → `disabled={disabled || item.quantity <= 1}`
- The increment button: `disabled={item.quantity >= item.stock}` → `disabled={disabled || item.quantity >= item.stock}`
- The Remove button: has no `disabled` attribute today — add `disabled={disabled}`

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/features/cart/CartTable.test.tsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 9: Write the failing test for the discount field and Subtotal/Total breakdown**

Add to `src/renderer/src/features/cart/PosPage.test.tsx`:

```typescript
  it('shows a Subtotal row and reduces the Total by the entered discount', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())

    expect(screen.getByLabelText('Subtotal')).toHaveTextContent('฿20.00')
    expect(screen.getByLabelText('Cart total')).toHaveTextContent('฿20.00')

    await user.type(screen.getByLabelText('Discount (Baht)'), '5')

    expect(screen.getByLabelText('Cart total')).toHaveTextContent('฿15.00')
  })

  it('rejects a discount larger than the subtotal without opening the payment method modal', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
    await user.type(screen.getByLabelText('Discount (Baht)'), '999')

    await user.click(screen.getByRole('button', { name: 'Finish Sale' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Discount cannot exceed the subtotal')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sends the entered discount to completeSale when a payment method is picked', async () => {
    const user = userEvent.setup()
    const sale: SaleRecord = {
      id: 'sale-1',
      totalCents: 1500,
      status: 'COMPLETED',
      paymentMethod: 'CASH',
      discountCents: 500,
      createdAt: '2026-09-03T00:00:00.000Z',
      items: []
    }
    ;(window.api.sales.complete as ReturnType<typeof vi.fn>).mockResolvedValue(sale)

    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
    await user.type(screen.getByLabelText('Discount (Baht)'), '5')

    await user.click(screen.getByRole('button', { name: 'Finish Sale' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Cash' }))

    expect(window.api.sales.complete).toHaveBeenCalledWith(
      [{ productId: '1', productName: 'Coke', unitPriceCents: 2000, quantity: 1 }],
      'CASH',
      500
    )
  })

  it('disables the discount field and every cart-editing control while the payment method modal is open', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Finish Sale' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    expect(screen.getByLabelText('Discount (Baht)')).toBeDisabled()
    // Anchored regex — plain /Coke/ would also match the stepper buttons'
    // "Increase/Decrease quantity of Coke" labels below, once the cart has
    // that item; the grid tile's accessible name is the only one that
    // starts with "Coke" (name span renders before the price span).
    expect(screen.getByRole('button', { name: /^Coke/ })).toBeDisabled()
    expect(screen.getByLabelText('Increase quantity of Coke')).toBeDisabled()
    expect(screen.getByLabelText('Decrease quantity of Coke')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear Cart' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Hold' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Held Carts (0)' })).toBeDisabled()
  })
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/features/cart/PosPage.test.tsx`
Expected: FAIL — no discount field, no Subtotal row, and nothing besides the barcode field is disabled while the modal is open yet.

- [ ] **Step 11: Implement the discount field, breakdown, and generalized lockout**

Change the top portion of `src/renderer/src/features/cart/PosPage.tsx`'s component body — after the existing hook calls and before `useEffect`, add:

```typescript
  const [discountBaht, setDiscountBaht] = useState('')
  const [discountError, setDiscountError] = useState<string | null>(null)
```

Add a derived-values block right before the `return (`:

```typescript
  const subtotalCents = cartTotalCents(items)
  const parsedDiscount = discountBaht.trim().length > 0 ? Money.parseBaht(discountBaht) : Money.fromCents(0)
  // Clamp for display only — the actual reject-if-too-large validation runs
  // on Finish Sale click, below. This just keeps the live Total display
  // from ever showing a negative number while the cashier is still typing.
  const displayDiscountCents = parsedDiscount ? Math.min(parsedDiscount.cents, subtotalCents) : 0
  const totalCents = subtotalCents - displayDiscountCents
```

Change `handleFinishSaleClick` from:

```typescript
  function handleFinishSaleClick(): void {
    setShowPaymentModal(true)
  }
```

to:

```typescript
  function handleFinishSaleClick(): void {
    if (discountBaht.trim().length > 0) {
      const discount = Money.parseBaht(discountBaht)
      if (!discount) {
        setDiscountError('Discount must be a non-negative number')
        return
      }
      if (discount.cents > subtotalCents) {
        setDiscountError('Discount cannot exceed the subtotal')
        return
      }
    }
    setDiscountError(null)
    setShowPaymentModal(true)
  }
```

Change `handleSelectPaymentMethod` from:

```typescript
  async function handleSelectPaymentMethod(method: PaymentMethod): Promise<void> {
    const sale = await completeSale(method)
    setShowPaymentModal(false)
    if (sale) {
      setSuccessMessage(`Sale completed — ${Money.fromCents(sale.totalCents).format()}`)
    }
  }
```

to:

```typescript
  async function handleSelectPaymentMethod(method: PaymentMethod): Promise<void> {
    const discountCents = discountBaht.trim().length > 0 ? (Money.parseBaht(discountBaht)?.cents ?? 0) : 0
    const sale = await completeSale(method, discountCents)
    setShowPaymentModal(false)
    if (sale) {
      setSuccessMessage(`Sale completed — ${Money.fromCents(sale.totalCents).format()}`)
      setDiscountBaht('')
    }
  }
```

Change the header block from:

```typescript
      <div className="products-header">
        <h1>POS</h1>
        <div className="pos-total" aria-label="Cart total">
          {Money.fromCents(cartTotalCents(items)).format()}
        </div>
      </div>
```

to:

```typescript
      <div className="products-header">
        <h1>POS</h1>
        <div className="pos-summary">
          <div className="pos-summary-row">
            <span>Subtotal</span>
            <span aria-label="Subtotal">{Money.fromCents(subtotalCents).format()}</span>
          </div>
          <div className="field pos-discount-field">
            <label htmlFor="pos-discount">Discount (Baht)</label>
            <input
              id="pos-discount"
              type="number"
              step="0.01"
              min="0"
              value={discountBaht}
              onChange={(e) => setDiscountBaht(e.target.value)}
              disabled={showPaymentModal}
            />
          </div>
          <div className="pos-summary-row pos-total-row">
            <span>Total</span>
            <span className="pos-total" aria-label="Cart total">
              {Money.fromCents(totalCents).format()}
            </span>
          </div>
        </div>
      </div>
```

Change the error-banner block from:

```typescript
      {(error || saleError) && !successMessage && (
        <p role="alert" className="alert alert-danger">
          {error ?? saleError}
        </p>
      )}
```

to:

```typescript
      {(error || saleError || discountError) && !successMessage && (
        <p role="alert" className="alert alert-danger">
          {error ?? saleError ?? discountError}
        </p>
      )}
```

Change the barcode input's `disabled` from `disabled={showPaymentModal}` (unchanged — already correct from Phase 8) — no edit needed there.

Change the `ProductGrid` render from:

```typescript
      <ProductGrid
        products={products}
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        onSelectCategory={setSelectedCategoryId}
        onSelectProduct={handleSelectProductTile}
      />
```

to:

```typescript
      <ProductGrid
        products={products}
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        onSelectCategory={setSelectedCategoryId}
        onSelectProduct={handleSelectProductTile}
        disabled={showPaymentModal}
      />
```

(`ProductGrid` has carried a `disabled` prop since Task 1 specifically for this — a tile click while the payment modal is open would call `scan()` and mutate the cart exactly like the barcode field would, so it needs the identical guard.)

Change the `CartTable` render from:

```typescript
        <CartTable
          items={items}
          onIncrement={incrementItem}
          onDecrement={decrementItem}
          onRemove={removeItem}
        />
```

to:

```typescript
        <CartTable
          items={items}
          onIncrement={incrementItem}
          onDecrement={decrementItem}
          onRemove={removeItem}
          disabled={showPaymentModal}
        />
```

Change the Hold and Clear Cart buttons' `disabled` conditions to also include `showPaymentModal`. Task 2 wrapped the footer's Hold button in `{!showHoldModal && (...)}` (to resolve a naming collision with `HoldCartModal`'s own submit button, both named "Hold") — keep that wrapper exactly as it is; only add `|| showPaymentModal` to its existing `disabled` expression, changing:

```typescript
        {!showHoldModal && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleHoldClick}
            disabled={items.length === 0 || completing}
          >
            Hold
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={handleShowHeldCarts}>
          {`Held Carts (${heldCarts.length})`}
        </button>
```

to:

```typescript
        {!showHoldModal && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleHoldClick}
            disabled={items.length === 0 || completing || showPaymentModal}
          >
            Hold
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleShowHeldCarts}
          disabled={showPaymentModal}
        >
          {`Held Carts (${heldCarts.length})`}
        </button>
```

Change the Clear Cart button from:

```typescript
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleClearCart}
          disabled={items.length === 0 || completing}
        >
          Clear Cart
        </button>
```

to:

```typescript
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleClearCart}
          disabled={items.length === 0 || completing || showPaymentModal}
        >
          Clear Cart
        </button>
```

(`Finish Sale` itself needs no change — it's already effectively guarded, since `showPaymentModal` being `true` means the modal covering it already blocks interaction, and it's already disabled while `completing`.)

Also change `handleClearCart` to clear the discount alongside the cart, since a cleared cart with a stale discount amount left in the field would silently apply to the *next* sale:

```typescript
  function handleClearCart(): void {
    clear()
    clearSaleError()
    setDiscountBaht('')
    setDiscountError(null)
  }
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/features/cart/PosPage.test.tsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 13: Add CSS**

Add to `src/renderer/src/assets/main.css`, right after the existing `.pos-total` rule:

```css
.pos-summary {
  display: flex;
  align-items: flex-end;
  gap: var(--space-4);
}

.pos-summary-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 14px;
  color: var(--color-ink-muted);
}

.pos-total-row {
  align-items: flex-end;
}

.pos-discount-field {
  max-width: 140px;
}
```

- [ ] **Step 14: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 15: Commit**

```bash
git add src/renderer/src/features/cart/useCompleteSale.ts src/renderer/src/features/cart/useCompleteSale.test.ts src/renderer/src/features/cart/CartTable.tsx src/renderer/src/features/cart/CartTable.test.tsx src/renderer/src/features/cart/PosPage.tsx src/renderer/src/features/cart/PosPage.test.tsx src/renderer/src/assets/main.css
git commit -m "feat: add discount field, Subtotal/Total breakdown, and lock the cart while the payment modal is open"
```

---

### Task 4: F12 keyboard shortcut for Finish Sale

**Files:**
- Modify: `src/renderer/src/features/cart/PosPage.tsx`
- Test: `src/renderer/src/features/cart/PosPage.test.tsx`

**Interfaces:**
- Consumes: `handleFinishSaleClick` (Task 3, unchanged signature — validates the discount and opens the payment modal).
- Produces: nothing new exported; purely a page-level keyboard listener.

- [ ] **Step 1: Write the failing test**

Add to `src/renderer/src/features/cart/PosPage.test.tsx`:

```typescript
  it('pressing F12 opens the payment method modal, same as clicking Finish Sale', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())

    await user.keyboard('{F12}')

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })

  it('pressing F12 does nothing when the cart is empty', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.keyboard('{F12}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('pressing F12 while the payment method modal is already open does not reopen or duplicate it', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Finish Sale' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await user.keyboard('{F12}')

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/features/cart/PosPage.test.tsx`
Expected: FAIL — F12 currently does nothing.

- [ ] **Step 3: Implement the shortcut**

Add a new `useEffect` in `src/renderer/src/features/cart/PosPage.tsx`, right after the existing `reconcileStock` effect:

```typescript
  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'F12') {
        return
      }
      event.preventDefault()
      if (items.length === 0 || completing || showPaymentModal) {
        return
      }
      handleFinishSaleClick()
    }
    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [items.length, completing, showPaymentModal, discountBaht, subtotalCents])
```

(`handleFinishSaleClick` is a plain function redefined on every render of `PosPage`, not wrapped in `useCallback` — matching how every other handler in this file is already written. The effect re-subscribes whenever any value `handleFinishSaleClick` reads changes, so the listener that's actually attached always closes over the current render's `discountBaht`/`subtotalCents`/state setters. This mirrors the existing `reconcileStock` effect's own `document`-listener-free-standing style, just with a dependency array instead of `[]`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/features/cart/PosPage.test.tsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Run the full suite, typecheck, and lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS / 0 errors — this is the last task of the phase, so the whole branch should be green here.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/features/cart/PosPage.tsx src/renderer/src/features/cart/PosPage.test.tsx
git commit -m "feat: add F12 keyboard shortcut for Finish Sale"
```
