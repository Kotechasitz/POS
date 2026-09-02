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
  syncStock: (productId: string, stock: number) => void
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addScannedProduct: (product) => {
    const existing = get().items.find((item) => item.productId === product.id)

    if (existing) {
      if (existing.quantity + 1 > product.stock) {
        set({
          items: get().items.map((item) =>
            item.productId === product.id ? { ...item, stock: product.stock } : item
          )
        })
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

  clear: () => set({ items: [] }),

  syncStock: (productId, stock) => {
    set({
      items: get().items.map((item) =>
        item.productId === productId
          ? { ...item, stock, quantity: Math.min(item.quantity, stock) }
          : item
      )
    })
  }
}))

export function lineTotalCents(item: CartItem): number {
  return Money.fromCents(item.unitPriceCents).multiply(item.quantity).cents
}

export function cartTotalCents(items: CartItem[]): number {
  return items.reduce(
    (total, item) => total.add(Money.fromCents(lineTotalCents(item))),
    Money.fromCents(0)
  ).cents
}
