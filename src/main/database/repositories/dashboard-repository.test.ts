import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createDbClient, type DbClient } from '../client'
import { sales, saleItems } from '../schema'
import { createProduct, updateProduct } from './product-repository'
import { completeSale } from './sale-repository'
import {
  getDashboardSummary,
  getLowStockProducts,
  getTopProducts,
  getSevenDaySales
} from './dashboard-repository'
import type { SaleLineInput } from '../../../shared/sale'

function daysAgoIso(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

describe('getDashboardSummary', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-dashboard-repo-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('returns zeros when there are no sales at all', () => {
    const summary = getDashboardSummary(client.db)
    expect(summary).toEqual({ salesTodayCents: 0, orderCountToday: 0, unitsSoldToday: 0 })
  })

  it("sums today's sales, counts orders, and sums units sold across multiple sales", () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 50 })

    const line1: SaleLineInput = {
      productId: coke.id,
      productName: coke.name,
      unitPriceCents: coke.priceCents,
      quantity: 2
    }
    const line2: SaleLineInput = {
      productId: water.id,
      productName: water.name,
      unitPriceCents: water.priceCents,
      quantity: 3
    }
    completeSale(client.db, [line1]) // 4000 cents, 2 units
    completeSale(client.db, [line2]) // 3000 cents, 3 units

    const summary = getDashboardSummary(client.db)
    expect(summary).toEqual({ salesTodayCents: 7000, orderCountToday: 2, unitsSoldToday: 5 })
  })

  it("excludes sales from before today", () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    // Directly insert a sale timestamped yesterday — completeSale always uses
    // the real current time, so a fabricated old row is inserted straight
    // into the table to control the date deterministically.
    client.db
      .insert(sales)
      .values({ id: 'yesterday-sale', totalCents: 9999, status: 'COMPLETED', createdAt: daysAgoIso(1) })
      .run()
    client.db
      .insert(saleItems)
      .values({
        id: 'yesterday-item',
        saleId: 'yesterday-sale',
        productId: coke.id,
        productName: coke.name,
        priceCents: 9999,
        quantity: 7,
        totalCents: 9999
      })
      .run()

    const summary = getDashboardSummary(client.db)
    expect(summary).toEqual({ salesTodayCents: 0, orderCountToday: 0, unitsSoldToday: 0 })
  })

  it('buckets "today" by the local calendar day, not the UTC calendar day', () => {
    const referenceDate = new Date()
    const offsetMinutes = referenceDate.getTimezoneOffset()
    if (offsetMinutes === 0) {
      // No local/UTC distinction exists to test on a UTC-clocked machine —
      // the other getDashboardSummary tests still cover correctness here.
      return
    }

    const localStart = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate()
    )
    const utcStart = new Date(
      Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate())
    )

    if (localStart.getTime() === utcStart.getTime()) {
      // The two boundaries happen to coincide for this instant — nothing to
      // distinguish right now.
      return
    }

    // Place the fabricated sale 1ms before whichever boundary is later, so
    // it falls strictly between the two candidate "start of today" instants
    // — "today" under one interpretation, "yesterday" (or "tomorrow") under
    // the other.
    const laterBoundary = Math.max(localStart.getTime(), utcStart.getTime())
    const testInstant = new Date(laterBoundary - 1)

    const coke = createProduct(client.db, { barcode: 'tzboundary', name: 'Coke', priceCents: 2000, stock: 50 })
    client.db
      .insert(sales)
      .values({
        id: 'tz-boundary-sale',
        totalCents: 9999,
        status: 'COMPLETED',
        createdAt: testInstant.toISOString()
      })
      .run()

    // What a CORRECT local-day implementation should decide for this instant:
    const expectedIncluded = testInstant.getTime() >= localStart.getTime()

    const summary = getDashboardSummary(client.db, referenceDate)
    expect(summary.salesTodayCents).toBe(expectedIncluded ? 9999 : 0)
  })

  it('excludes sales whose status is not COMPLETED', () => {
    client.db
      .insert(sales)
      .values({ id: 'cancelled-sale', totalCents: 5000, status: 'CANCELLED', createdAt: new Date().toISOString() })
      .run()

    const summary = getDashboardSummary(client.db)
    expect(summary.salesTodayCents).toBe(0)
    expect(summary.orderCountToday).toBe(0)
  })
})

describe('getLowStockProducts', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-dashboard-repo-lowstock-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('returns only products at or below the threshold, ordered by stock ascending', () => {
    createProduct(client.db, { barcode: '111', name: 'Plenty', priceCents: 100, stock: 50 })
    createProduct(client.db, { barcode: '222', name: 'Exactly at threshold', priceCents: 100, stock: 5 })
    createProduct(client.db, { barcode: '333', name: 'Very low', priceCents: 100, stock: 1 })

    const result = getLowStockProducts(client.db, 5)
    expect(result.map((p) => p.name)).toEqual(['Very low', 'Exactly at threshold'])
  })

  it('excludes inactive products even if their stock is low', () => {
    const inactive = createProduct(client.db, { barcode: '444', name: 'Discontinued', priceCents: 100, stock: 0 })
    updateProduct(client.db, inactive.id, { isActive: false })

    const result = getLowStockProducts(client.db, 5)
    expect(result).toHaveLength(0)
  })

  it('defaults to a threshold of 5 when none is given', () => {
    createProduct(client.db, { barcode: '555', name: 'Right at default', priceCents: 100, stock: 5 })
    createProduct(client.db, { barcode: '666', name: 'Above default', priceCents: 100, stock: 6 })

    const result = getLowStockProducts(client.db)
    expect(result.map((p) => p.name)).toEqual(['Right at default'])
  })
})

describe('getTopProducts', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-dashboard-repo-top-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('ranks products by total quantity sold, descending', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 50 })

    completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 2 }
    ])
    completeSale(client.db, [
      { productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 5 }
    ])

    const top = getTopProducts(client.db)
    expect(top[0]).toMatchObject({ productId: water.id, productName: 'Water', totalQuantity: 5, totalRevenueCents: 5000 })
    expect(top[1]).toMatchObject({ productId: coke.id, productName: 'Coke', totalQuantity: 2, totalRevenueCents: 4000 })
  })

  it('sums quantity across multiple sales of the same product', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 2 }
    ])
    completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 3 }
    ])

    const top = getTopProducts(client.db)
    expect(top).toHaveLength(1)
    expect(top[0].totalQuantity).toBe(5)
  })

  it('respects the limit', () => {
    const a = createProduct(client.db, { barcode: '1', name: 'A', priceCents: 100, stock: 50 })
    const b = createProduct(client.db, { barcode: '2', name: 'B', priceCents: 100, stock: 50 })
    const c = createProduct(client.db, { barcode: '3', name: 'C', priceCents: 100, stock: 50 })
    completeSale(client.db, [{ productId: a.id, productName: a.name, unitPriceCents: 100, quantity: 3 }])
    completeSale(client.db, [{ productId: b.id, productName: b.name, unitPriceCents: 100, quantity: 2 }])
    completeSale(client.db, [{ productId: c.id, productName: c.name, unitPriceCents: 100, quantity: 1 }])

    const top = getTopProducts(client.db, 2)
    expect(top).toHaveLength(2)
    expect(top.map((p) => p.productId)).toEqual([a.id, b.id])
  })

  it('returns an empty array when there are no sales', () => {
    expect(getTopProducts(client.db)).toEqual([])
  })
})

describe('getSevenDaySales', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-dashboard-repo-7day-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('returns exactly 7 entries, oldest first, all zero when there are no sales', () => {
    const result = getSevenDaySales(client.db)
    expect(result).toHaveLength(7)
    expect(result.every((day) => day.totalCents === 0)).toBe(true)
    expect(new Date(result[0].date).getTime()).toBeLessThan(new Date(result[6].date).getTime())
  })

  it("includes today's sales in the last bucket", () => {
    client.db
      .insert(sales)
      .values({ id: 'today-sale', totalCents: 1500, status: 'COMPLETED', createdAt: new Date().toISOString() })
      .run()

    const result = getSevenDaySales(client.db)
    expect(result[6].totalCents).toBe(1500)
  })

  it('includes a sale from exactly 6 days ago in the first bucket', () => {
    const sixDaysAgo = new Date()
    sixDaysAgo.setDate(sixDaysAgo.getDate() - 6)
    client.db
      .insert(sales)
      .values({ id: 'six-days-ago-sale', totalCents: 2500, status: 'COMPLETED', createdAt: sixDaysAgo.toISOString() })
      .run()

    const result = getSevenDaySales(client.db)
    expect(result[0].totalCents).toBe(2500)
  })

  it('excludes a sale from 7 days ago (one day outside the window)', () => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    client.db
      .insert(sales)
      .values({ id: 'seven-days-ago-sale', totalCents: 9999, status: 'COMPLETED', createdAt: sevenDaysAgo.toISOString() })
      .run()

    const result = getSevenDaySales(client.db)
    expect(result.reduce((sum, day) => sum + day.totalCents, 0)).toBe(0)
  })
})
