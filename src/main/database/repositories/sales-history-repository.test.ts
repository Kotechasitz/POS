import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const isMock = vi.hoisted(() => ({ dev: true }))
vi.mock('@electron-toolkit/utils', () => ({ is: isMock }))
vi.mock('electron', () => ({ app: { getPath: vi.fn() } }))

import { eq } from 'drizzle-orm'
import { sales, saleVoids, products, stockTransactions } from '../schema'
import { createDbClient, type DbClient } from '../client'
import { createProduct, getProductById, ProductNotFoundError } from './product-repository'
import { completeSale, SaleValidationError } from './sale-repository'
import {
  listSales,
  getSaleWithItems,
  voidSale,
  SaleNotFoundError,
  SaleAlreadyVoidError
} from './sales-history-repository'

describe('listSales', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-sales-history-repo-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('returns an empty array when there are no sales', () => {
    expect(listSales(client.db)).toEqual([])
  })

  it('assigns sequential bill numbers in creation order and lists newest first', () => {
    const coke = createProduct(client.db, {
      barcode: '111',
      name: 'Coke',
      priceCents: 2000,
      stock: 50
    })
    const first = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 }
    ], 'CASH')
    const second = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 2 }
    ], 'CASH')

    const list = listSales(client.db)
    expect(list).toHaveLength(2)
    // Newest first:
    expect(list[0]).toMatchObject({ id: second.id, billNumber: 2 })
    expect(list[1]).toMatchObject({ id: first.id, billNumber: 1 })
  })

  it('reports the correct item count per sale', () => {
    const coke = createProduct(client.db, {
      barcode: '111',
      name: 'Coke',
      priceCents: 2000,
      stock: 50
    })
    const water = createProduct(client.db, {
      barcode: '222',
      name: 'Water',
      priceCents: 1000,
      stock: 50
    })

    const twoLineSale = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 },
      {
        productId: water.id,
        productName: water.name,
        unitPriceCents: water.priceCents,
        quantity: 1
      }
    ], 'CASH')
    const oneLineSale = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 }
    ], 'CASH')

    const list = listSales(client.db)
    const twoLine = list.find((s) => s.id === twoLineSale.id)
    const oneLine = list.find((s) => s.id === oneLineSale.id)
    expect(twoLine?.itemCount).toBe(2)
    expect(oneLine?.itemCount).toBe(1)
  })

  it("includes each sale's status and payment method", () => {
    const coke = createProduct(client.db, {
      barcode: '111',
      name: 'Coke',
      priceCents: 2000,
      stock: 50
    })
    completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 }
    ], 'QR')

    const [row] = listSales(client.db)
    expect(row.status).toBe('COMPLETED')
    expect(row.paymentMethod).toBe('QR')
  })
})

describe('getSaleWithItems', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(
      os.tmpdir(),
      `pos-sales-history-repo-detail-${Date.now()}-${Math.random()}.db`
    )
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('returns the full sale record with its line items', () => {
    const coke = createProduct(client.db, {
      barcode: '111',
      name: 'Coke',
      priceCents: 2000,
      stock: 50
    })
    const sale = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 3 }
    ], 'CASH')

    const detail = getSaleWithItems(client.db, sale.id)
    expect(detail?.totalCents).toBe(6000)
    expect(detail?.status).toBe('COMPLETED')
    expect(detail?.paymentMethod).toBe('CASH')
    expect(detail?.discountCents).toBe(0)
    expect(detail?.items).toHaveLength(1)
    expect(detail?.items[0]).toMatchObject({ productName: 'Coke', quantity: 3, totalCents: 6000 })
  })

  it('returns undefined for a sale id that does not exist', () => {
    expect(getSaleWithItems(client.db, 'does-not-exist')).toBeUndefined()
  })

  it('omits voidReason/voidedAt for a sale that was never voided', () => {
    const coke = createProduct(client.db, {
      barcode: '111',
      name: 'Coke',
      priceCents: 2000,
      stock: 50
    })
    const sale = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 }
    ], 'CASH')

    const detail = getSaleWithItems(client.db, sale.id)
    expect(detail?.voidReason).toBeUndefined()
    expect(detail?.voidedAt).toBeUndefined()
  })

  it('includes voidReason/voidedAt once a sale_voids row exists for it', () => {
    const coke = createProduct(client.db, {
      barcode: '111',
      name: 'Coke',
      priceCents: 2000,
      stock: 50
    })
    const sale = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 }
    ], 'CASH')
    client.db
      .insert(saleVoids)
      .values({ id: 'void-1', saleId: sale.id, reason: 'Customer changed their mind', voidedAt: '2026-09-06T10:00:00.000Z' })
      .run()
    client.db.update(sales).set({ status: 'VOID' }).where(eq(sales.id, sale.id)).run()

    const detail = getSaleWithItems(client.db, sale.id)
    expect(detail?.status).toBe('VOID')
    expect(detail?.voidReason).toBe('Customer changed their mind')
    expect(detail?.voidedAt).toBe('2026-09-06T10:00:00.000Z')
  })
})

describe('voidSale', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-sales-history-repo-void-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('voids a completed sale: sets status, records the reason, and returns stock', () => {
    const water = createProduct(client.db, {
      barcode: '222',
      name: 'Water',
      priceCents: 1000,
      stock: 10
    })
    const sale = completeSale(
      client.db,
      [{ productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 3 }],
      'CASH'
    )
    const stockAfterSale = getProductById(client.db, water.id)?.stock
    expect(stockAfterSale).toBe(7)

    const voided = voidSale(client.db, sale.id, 'Customer changed their mind')

    expect(voided.status).toBe('VOID')
    expect(voided.voidReason).toBe('Customer changed their mind')
    expect(voided.voidedAt).toBeDefined()

    const stockAfterVoid = getProductById(client.db, water.id)?.stock
    expect(stockAfterVoid).toBe(10)

    const voidRows = client.db.select().from(saleVoids).where(eq(saleVoids.saleId, sale.id)).all()
    expect(voidRows).toHaveLength(1)
    expect(voidRows[0].reason).toBe('Customer changed their mind')

    const returnTxns = client.db
      .select()
      .from(stockTransactions)
      .where(eq(stockTransactions.referenceId, sale.id))
      .all()
      .filter((txn) => txn.type === 'VOID')
    expect(returnTxns).toHaveLength(1)
    expect(returnTxns[0]).toMatchObject({ productId: water.id, quantity: 3, type: 'VOID' })
  })

  it('voids a multi-line sale, returning stock for every line', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 10 })
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 10 })
    const sale = completeSale(
      client.db,
      [
        { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 2 },
        { productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 4 }
      ],
      'CASH'
    )

    voidSale(client.db, sale.id, 'Wrong order')

    expect(getProductById(client.db, coke.id)?.stock).toBe(10)
    expect(getProductById(client.db, water.id)?.stock).toBe(10)
    const returnTxns = client.db
      .select()
      .from(stockTransactions)
      .where(eq(stockTransactions.referenceId, sale.id))
      .all()
      .filter((txn) => txn.type === 'VOID')
    expect(returnTxns).toHaveLength(2)
  })

  it('rejects voiding with an empty reason, writing nothing', () => {
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 5 })
    const sale = completeSale(
      client.db,
      [{ productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 1 }],
      'CASH'
    )
    const stockBeforeVoid = getProductById(client.db, water.id)?.stock

    expect(() => voidSale(client.db, sale.id, '   ')).toThrow(SaleValidationError)

    const unchanged = getSaleWithItems(client.db, sale.id)
    expect(unchanged?.status).toBe('COMPLETED')
    expect(client.db.select().from(saleVoids).where(eq(saleVoids.saleId, sale.id)).all()).toHaveLength(0)
    expect(getProductById(client.db, water.id)?.stock).toBe(stockBeforeVoid)
  })

  it('throws SaleNotFoundError for a sale id that does not exist', () => {
    expect(() => voidSale(client.db, 'does-not-exist', 'Some reason')).toThrow(SaleNotFoundError)
  })

  it('rejects voiding an already-void sale, and does not double-return stock', () => {
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 10 })
    const sale = completeSale(
      client.db,
      [{ productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 3 }],
      'CASH'
    )
    voidSale(client.db, sale.id, 'First void')

    expect(() => voidSale(client.db, sale.id, 'Trying again')).toThrow(SaleAlreadyVoidError)

    expect(getProductById(client.db, water.id)?.stock).toBe(10)
    expect(client.db.select().from(saleVoids).where(eq(saleVoids.saleId, sale.id)).all()).toHaveLength(1)
  })

  it('rolls back the entire void when a line references a product that no longer exists, leaving earlier lines\' stock untouched', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 10 })
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 10 })
    const sale = completeSale(
      client.db,
      [
        { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 2 },
        { productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 4 }
      ],
      'CASH'
    )
    // Simulate a corrupted/inconsistent database (products are never
    // hard-deleted by any normal app code path) to force a genuine
    // mid-transaction failure on the second line, after the first
    // line's stock update has already run inside the same transaction —
    // proving the whole thing rolls back together, not just the failing
    // line. FK enforcement (client.ts sets PRAGMA foreign_keys = ON) would
    // otherwise block this hard-delete since sale_items.product_id still
    // references it — toggle it off for just this one deliberately-illegal
    // setup statement, then back on before exercising voidSale itself.
    client.sqlite.pragma('foreign_keys = OFF')
    client.db.delete(products).where(eq(products.id, water.id)).run()
    client.sqlite.pragma('foreign_keys = ON')

    expect(() => voidSale(client.db, sale.id, 'Testing rollback')).toThrow(ProductNotFoundError)

    expect(getProductById(client.db, coke.id)?.stock).toBe(8)
    const unchanged = getSaleWithItems(client.db, sale.id)
    expect(unchanged?.status).toBe('COMPLETED')
    expect(client.db.select().from(saleVoids).where(eq(saleVoids.saleId, sale.id)).all()).toHaveLength(0)
    expect(
      client.db
        .select()
        .from(stockTransactions)
        .where(eq(stockTransactions.referenceId, sale.id))
        .all()
        .filter((txn) => txn.type === 'VOID')
    ).toHaveLength(0)
  })
})
