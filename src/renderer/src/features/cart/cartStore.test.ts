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

  it("rejects adding beyond the product's available stock", () => {
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

  it('computes line and cart totals using integer-cents money math', () => {
    useCartStore.getState().addScannedProduct(coke)
    useCartStore.getState().incrementItem('1')
    useCartStore.getState().addScannedProduct(water)

    const items = useCartStore.getState().items
    expect(lineTotalCents(items[0])).toBe(4000)
    expect(cartTotalCents(items)).toBe(5000)
  })

  it('syncStock updates the cached stock and clamps quantity down if it now exceeds the new stock', () => {
    useCartStore.getState().addScannedProduct(coke) // stock 5, quantity 1
    useCartStore.getState().incrementItem('1')
    useCartStore.getState().incrementItem('1')
    useCartStore.getState().incrementItem('1') // quantity 4, stock still cached as 5

    useCartStore.getState().syncStock('1', 2)

    expect(useCartStore.getState().items[0].stock).toBe(2)
    expect(useCartStore.getState().items[0].quantity).toBe(2)
  })

  it('addScannedProduct refreshes cached stock on a rejected rescan, not just an accepted one', () => {
    useCartStore.getState().addScannedProduct(water) // stock 1, quantity 1
    const result = useCartStore.getState().addScannedProduct(water) // still stock 1 -> rejected

    expect(result).toEqual({ ok: false, reason: 'out-of-stock' })
    expect(useCartStore.getState().items[0].stock).toBe(1)

    // Now simulate stock having increased in the DB since the last scan/reject —
    // rescanning should refresh the cached stock even though this attempt also rejects.
    const rescanResult = useCartStore.getState().addScannedProduct({ ...water, stock: 1 })
    expect(rescanResult).toEqual({ ok: false, reason: 'out-of-stock' })
    expect(useCartStore.getState().items[0].stock).toBe(1)
  })
})
