import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { eq } from 'drizzle-orm'
import { createDbClient, type DbClient } from '../client'
import { products, sales, saleItems, stockTransactions } from '../schema'
import { createProduct } from './product-repository'
import { completeSale, EmptyCartError, InsufficientStockError } from './sale-repository'
import type { SaleLineInput } from '../../../shared/sale'

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
    const sale = completeSale(client.db, [line])

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
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 10 })
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 10 })

    const sale = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 2 },
      { productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 3 }
    ])

    expect(sale.totalCents).toBe(2000 * 2 + 1000 * 3)
    expect(sale.items).toHaveLength(2)

    const savedItems = client.db.select().from(saleItems).where(eq(saleItems.saleId, sale.id)).all()
    expect(savedItems).toHaveLength(2)
  })

  it('rejects an empty cart without writing anything', () => {
    expect(() => completeSale(client.db, [])).toThrow(EmptyCartError)
    expect(client.db.select().from(sales).all()).toHaveLength(0)
  })

  it('rejects a line that would oversell stock, and rolls back the entire sale', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 5 })
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 1 })

    expect(() =>
      completeSale(client.db, [
        { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 2 },
        { productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 2 }
      ])
    ).toThrow(InsufficientStockError)

    // Nothing committed at all — including the first, individually-valid line.
    expect(client.db.select().from(sales).all()).toHaveLength(0)
    expect(client.db.select().from(saleItems).all()).toHaveLength(0)
    expect(client.db.select().from(stockTransactions).all()).toHaveLength(0)

    const cokeAfter = client.db.select().from(products).where(eq(products.id, coke.id)).get()
    expect(cokeAfter?.stock).toBe(5)
  })

  it('rejects selling exactly one more unit than is in stock', () => {
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 1 })

    expect(() =>
      completeSale(client.db, [
        { productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 2 }
      ])
    ).toThrow(InsufficientStockError)
  })

  it('allows selling exactly the remaining stock down to zero', () => {
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 2 })

    const sale = completeSale(client.db, [
      { productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 2 }
    ])

    expect(sale.totalCents).toBe(2000)
    const after = client.db.select().from(products).where(eq(products.id, water.id)).get()
    expect(after?.stock).toBe(0)
  })

  it('keeps the sale_items price snapshot unchanged after the product price is edited later (spec §14.1)', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 5 })

    const sale = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 }
    ])
    expect(sale.items[0].priceCents).toBe(2000)

    client.db
      .update(products)
      .set({ priceCents: 3500 })
      .where(eq(products.id, coke.id))
      .run()

    const persistedItem = client.db
      .select()
      .from(saleItems)
      .where(eq(saleItems.saleId, sale.id))
      .get()
    expect(persistedItem?.priceCents).toBe(2000)
  })
})
