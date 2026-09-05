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
