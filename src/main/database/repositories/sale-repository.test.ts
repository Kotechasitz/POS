import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { eq } from 'drizzle-orm'

const isMock = vi.hoisted(() => ({ dev: true }))
vi.mock('@electron-toolkit/utils', () => ({ is: isMock }))
vi.mock('electron', () => ({ app: { getPath: vi.fn() } }))

import { createDbClient, type DbClient } from '../client'
import { products, sales, saleItems, stockTransactions } from '../schema'
import { createProduct, updateProduct } from './product-repository'
import {
  completeSale,
  EmptyCartError,
  InsufficientStockError,
  ProductNotAvailableError,
  SaleValidationError
} from './sale-repository'
import { ProductNotFoundError } from './product-repository'
import type { SaleLineInput, PaymentMethod } from '../../../shared/sale'

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
    const sale = completeSale(client.db, [line], 'CASH')

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
    const coke = createProduct(client.db, {
      barcode: '111',
      name: 'Coke',
      priceCents: 2000,
      stock: 10
    })
    const water = createProduct(client.db, {
      barcode: '222',
      name: 'Water',
      priceCents: 1000,
      stock: 10
    })

    const sale = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 2 },
      {
        productId: water.id,
        productName: water.name,
        unitPriceCents: water.priceCents,
        quantity: 3
      }
    ], 'CASH')

    expect(sale.totalCents).toBe(2000 * 2 + 1000 * 3)
    expect(sale.items).toHaveLength(2)

    const savedItems = client.db.select().from(saleItems).where(eq(saleItems.saleId, sale.id)).all()
    expect(savedItems).toHaveLength(2)
  })

  it('rejects an empty cart without writing anything', () => {
    expect(() => completeSale(client.db, [], 'CASH')).toThrow(EmptyCartError)
    expect(client.db.select().from(sales).all()).toHaveLength(0)
  })

  it('rejects a line that would oversell stock, and rolls back the entire sale', () => {
    const coke = createProduct(client.db, {
      barcode: '111',
      name: 'Coke',
      priceCents: 2000,
      stock: 5
    })
    const water = createProduct(client.db, {
      barcode: '222',
      name: 'Water',
      priceCents: 1000,
      stock: 1
    })

    expect(() =>
      completeSale(client.db, [
        {
          productId: coke.id,
          productName: coke.name,
          unitPriceCents: coke.priceCents,
          quantity: 2
        },
        {
          productId: water.id,
          productName: water.name,
          unitPriceCents: water.priceCents,
          quantity: 2
        }
      ], 'CASH')
    ).toThrow(InsufficientStockError)

    // Nothing committed at all — including the first, individually-valid line.
    expect(client.db.select().from(sales).all()).toHaveLength(0)
    expect(client.db.select().from(saleItems).all()).toHaveLength(0)
    expect(client.db.select().from(stockTransactions).all()).toHaveLength(0)

    const cokeAfter = client.db.select().from(products).where(eq(products.id, coke.id)).get()
    expect(cokeAfter?.stock).toBe(5)
  })

  it('rejects selling exactly one more unit than is in stock', () => {
    const water = createProduct(client.db, {
      barcode: '222',
      name: 'Water',
      priceCents: 1000,
      stock: 1
    })

    expect(() =>
      completeSale(client.db, [
        {
          productId: water.id,
          productName: water.name,
          unitPriceCents: water.priceCents,
          quantity: 2
        }
      ], 'CASH')
    ).toThrow(InsufficientStockError)
  })

  it('allows selling exactly the remaining stock down to zero', () => {
    const water = createProduct(client.db, {
      barcode: '222',
      name: 'Water',
      priceCents: 1000,
      stock: 2
    })

    const sale = completeSale(client.db, [
      {
        productId: water.id,
        productName: water.name,
        unitPriceCents: water.priceCents,
        quantity: 2
      }
    ], 'CASH')

    expect(sale.totalCents).toBe(2000)
    const after = client.db.select().from(products).where(eq(products.id, water.id)).get()
    expect(after?.stock).toBe(0)
  })

  it('keeps the sale_items price snapshot unchanged after the product price is edited later (spec §14.1)', () => {
    const coke = createProduct(client.db, {
      barcode: '111',
      name: 'Coke',
      priceCents: 2000,
      stock: 5
    })

    const sale = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 }
    ], 'CASH')
    expect(sale.items[0].priceCents).toBe(2000)

    client.db.update(products).set({ priceCents: 3500 }).where(eq(products.id, coke.id)).run()

    const persistedItem = client.db
      .select()
      .from(saleItems)
      .where(eq(saleItems.saleId, sale.id))
      .get()
    expect(persistedItem?.priceCents).toBe(2000)
  })

  it('rejects a line with an empty product id', () => {
    expect(() =>
      completeSale(client.db, [
        { productId: '', productName: 'X', unitPriceCents: 100, quantity: 1 }
      ], 'CASH')
    ).toThrow(SaleValidationError)
  })

  it('rejects a line with a non-positive quantity', () => {
    const water = createProduct(client.db, {
      barcode: '222',
      name: 'Water',
      priceCents: 1000,
      stock: 5
    })
    expect(() =>
      completeSale(client.db, [
        {
          productId: water.id,
          productName: water.name,
          unitPriceCents: water.priceCents,
          quantity: 0
        }
      ], 'CASH')
    ).toThrow(SaleValidationError)
  })

  it('rejects a line with a non-integer quantity', () => {
    const water = createProduct(client.db, {
      barcode: '222',
      name: 'Water',
      priceCents: 1000,
      stock: 5
    })
    expect(() =>
      completeSale(client.db, [
        {
          productId: water.id,
          productName: water.name,
          unitPriceCents: water.priceCents,
          quantity: 1.5
        }
      ], 'CASH')
    ).toThrow(SaleValidationError)
  })

  it('rejects a line with a negative unit price', () => {
    const water = createProduct(client.db, {
      barcode: '222',
      name: 'Water',
      priceCents: 1000,
      stock: 5
    })
    expect(() =>
      completeSale(client.db, [
        { productId: water.id, productName: water.name, unitPriceCents: -100, quantity: 1 }
      ], 'CASH')
    ).toThrow(SaleValidationError)
  })

  it('throws ProductNotFoundError for a product id that does not exist', () => {
    expect(() =>
      completeSale(client.db, [
        { productId: 'does-not-exist', productName: 'Ghost', unitPriceCents: 100, quantity: 1 }
      ], 'CASH')
    ).toThrow(ProductNotFoundError)
  })

  it('builds the insufficient-stock error from the authoritative DB product name, not the stale cart-supplied name', () => {
    const water = createProduct(client.db, {
      barcode: '222',
      name: 'Water',
      priceCents: 1000,
      stock: 1
    })
    const line: SaleLineInput = {
      productId: water.id,
      productName: 'Stale Cart Name',
      unitPriceCents: water.priceCents,
      quantity: 2
    }

    expect.assertions(2)
    try {
      completeSale(client.db, [line], 'CASH')
    } catch (err) {
      expect((err as Error).message).toContain('Water')
      expect((err as Error).message).not.toContain('Stale Cart Name')
    }
  })

  it('rejects a sale line for a product that was deactivated after being added to the cart, and rolls back the entire sale', () => {
    const water = createProduct(client.db, {
      barcode: '222',
      name: 'Water',
      priceCents: 1000,
      stock: 5
    })
    updateProduct(client.db, water.id, { isActive: false })

    expect(() =>
      completeSale(client.db, [
        {
          productId: water.id,
          productName: water.name,
          unitPriceCents: water.priceCents,
          quantity: 1
        }
      ], 'CASH')
    ).toThrow(ProductNotAvailableError)

    expect(client.db.select().from(sales).all()).toHaveLength(0)
    expect(client.db.select().from(saleItems).all()).toHaveLength(0)
    expect(client.db.select().from(stockTransactions).all()).toHaveLength(0)

    const waterAfter = client.db.select().from(products).where(eq(products.id, water.id)).get()
    expect(waterAfter?.stock).toBe(5)
  })

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
})
