import { create } from 'zustand'
import type { CartItem } from './cartStore'

export interface HeldCart {
  id: string
  label: string | null
  items: CartItem[]
  discountBaht: string
  heldAt: string
}

interface HeldCartsState {
  heldCarts: HeldCart[]
  hold: (items: CartItem[], label: string, discountBaht: string) => void
  discard: (id: string) => void
}

export const useHeldCartsStore = create<HeldCartsState>((set, get) => ({
  heldCarts: [],

  hold: (items, label, discountBaht) => {
    const trimmed = label.trim()
    set({
      heldCarts: [
        ...get().heldCarts,
        {
          id: crypto.randomUUID(),
          label: trimmed.length > 0 ? trimmed : null,
          items,
          discountBaht,
          heldAt: new Date().toISOString()
        }
      ]
    })
  },

  discard: (id) => {
    set({ heldCarts: get().heldCarts.filter((held) => held.id !== id) })
  }
}))
