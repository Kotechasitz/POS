import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const isMock = vi.hoisted(() => ({ dev: true }))
vi.mock('@electron-toolkit/utils', () => ({ is: isMock }))
vi.mock('electron', () => ({ app: { getPath: vi.fn() } }))

import { createDbClient, type DbClient } from '../client'
import { sales } from '../schema'
import { createProduct, updateProduct } from './product-repository'
import { completeSale } from './sale-repository'
import {
  getDashboardStats,
  getSalesChartData,
  getPaymentMethodBreakdown,
  getLowStockProducts,
  getTopProducts
} from './dashboard-repository'
import type { SaleLineInput, PaymentMethod, SaleStatus } from '../../../shared/sale'

function daysAgoIso(days: number, hour = 12): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

function insertRawSale(
  client: DbClient,
  id: string,
  totalCents: number,
  createdAt: string,
  status: SaleStatus = 'COMPLETED',
  paymentMethod: PaymentMethod = 'CASH'
): void {
  client.db.insert(sales).values({ id, totalCents, status, paymentMethod, createdAt }).run()
}

describe('getDashboardStats', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-dashboard-stats-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it("'today': returns zeros for both periods when there are no sales at all", () => {
    const result = getDashboardStats(client.db, 'today')
    expect(result).toEqual({
      current: { salesCents: 0, orderCount: 0, unitsSold: 0, avgOrderValueCents: 0 },
      previous: { salesCents: 0, orderCount: 0, unitsSold: 0, avgOrderValueCents: 0 }
    })
  })

  it("'today': current is today's sales, previous is yesterday's, computed correctly with an average", () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    const line: SaleLineInput = {
      productId: coke.id,
      productName: coke.name,
      unitPriceCents: coke.priceCents,
      quantity: 2
    }
    completeSale(client.db, [line], 'CASH') // today, 4000 cents, 2 units
    completeSale(client.db, [line], 'CASH') // today, 4000 cents, 2 units
    insertRawSale(client, 'yesterday-sale', 3000, daysAgoIso(1))

    const result = getDashboardStats(client.db, 'today')
    expect(result.current).toEqual({
      salesCents: 8000,
      orderCount: 2,
      unitsSold: 4,
      avgOrderValueCents: 4000
    })
    expect(result.previous).toEqual({
      salesCents: 3000,
      orderCount: 1,
      unitsSold: 0,
      avgOrderValueCents: 3000
    })
  })

  it("'today': avgOrderValueCents is 0 when a period has no orders, not a division error", () => {
    const result = getDashboardStats(client.db, 'today')
    expect(result.current.avgOrderValueCents).toBe(0)
    expect(result.previous.avgOrderValueCents).toBe(0)
  })

  it("'today': excludes sales whose status is not COMPLETED", () => {
    insertRawSale(client, 'void-sale', 5000, new Date().toISOString(), 'VOID')
    const result = getDashboardStats(client.db, 'today')
    expect(result.current.salesCents).toBe(0)
    expect(result.current.orderCount).toBe(0)
  })

  it("'7days': current is the trailing 7 local days, previous is the 7 immediately before", () => {
    insertRawSale(client, 'today-sale', 1000, daysAgoIso(0))
    insertRawSale(client, 'six-days-ago', 2000, daysAgoIso(6))
    insertRawSale(client, 'seven-days-ago', 9999, daysAgoIso(7))
    insertRawSale(client, 'thirteen-days-ago', 3000, daysAgoIso(13))
    insertRawSale(client, 'fourteen-days-ago', 9999, daysAgoIso(14))

    const result = getDashboardStats(client.db, '7days')
    // Current window: days 0-6 ago -> today-sale + six-days-ago = 3000
    expect(result.current.salesCents).toBe(3000)
    expect(result.current.orderCount).toBe(2)
    // Previous window: days 7-13 ago -> seven-days-ago + thirteen-days-ago = 12999
    expect(result.previous.salesCents).toBe(12999)
    expect(result.previous.orderCount).toBe(2)
  })

  it("buckets 'today' by the local calendar day, not the UTC calendar day", () => {
    const referenceDate = new Date()
    const offsetMinutes = referenceDate.getTimezoneOffset()
    if (offsetMinutes === 0) {
      // No local/UTC distinction exists to test on a UTC-clocked machine.
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
      return
    }

    const laterBoundary = Math.max(localStart.getTime(), utcStart.getTime())
    const testInstant = new Date(laterBoundary - 1)
    insertRawSale(client, 'tz-boundary-sale', 9999, testInstant.toISOString())

    const expectedIncluded = testInstant.getTime() >= localStart.getTime()
    const result = getDashboardStats(client.db, 'today', referenceDate)
    expect(result.current.salesCents).toBe(expectedIncluded ? 9999 : 0)
  })
})

describe('getSalesChartData', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-dashboard-chart-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it("'today': returns exactly 24 hourly buckets, all zero when there are no sales", () => {
    const result = getSalesChartData(client.db, 'today')
    expect(result).toHaveLength(24)
    expect(result.every((bucket) => bucket.totalCents === 0)).toBe(true)
  })

  it("'today': places a sale in the bucket matching its local hour", () => {
    const referenceDate = new Date()
    const nineAm = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate(),
      9,
      30
    )
    insertRawSale(client, 'nine-am-sale', 1500, nineAm.toISOString())

    const result = getSalesChartData(client.db, 'today', referenceDate)
    expect(result[9].totalCents).toBe(1500)
    expect(result.filter((b) => b.totalCents > 0)).toHaveLength(1)
  })

  it("'today': labels each hourly bucket using the local hour, not UTC", () => {
    const referenceDate = new Date(2026, 8, 5)
    const expectedHour3Label = new Date(2026, 8, 5, 3).toLocaleTimeString(undefined, {
      hour: 'numeric'
    })
    const result = getSalesChartData(client.db, 'today', referenceDate)
    expect(result[3].label).toBe(expectedHour3Label)
  })

  it("'7days': returns exactly 7 daily buckets, oldest first, matching getDashboardStats' current window", () => {
    insertRawSale(client, 'today-sale', 1500, daysAgoIso(0))
    insertRawSale(client, 'six-days-ago', 2500, daysAgoIso(6))
    insertRawSale(client, 'seven-days-ago', 9999, daysAgoIso(7))

    const result = getSalesChartData(client.db, '7days')
    expect(result).toHaveLength(7)
    expect(result[6].totalCents).toBe(1500) // today is the last bucket
    expect(result[0].totalCents).toBe(2500) // 6 days ago is the first bucket
    expect(result.reduce((sum, b) => sum + b.totalCents, 0)).toBe(4000) // 7-days-ago excluded
  })

  it("'7days': labels each bucket with its local weekday, not UTC", () => {
    const referenceDate = new Date(2026, 8, 5) // a Saturday
    const expectedLastLabel = new Date(2026, 8, 5).toLocaleDateString(undefined, {
      weekday: 'short'
    })
    const result = getSalesChartData(client.db, '7days', referenceDate)
    expect(result[6].label).toBe(expectedLastLabel)
  })

  it("'7days': bucket totals sum to exactly getDashboardStats' current-period total, proving both share one window definition (not two independently-hardcoded '6's that could drift apart)", () => {
    insertRawSale(client, 'today-sale', 1500, daysAgoIso(0))
    insertRawSale(client, 'six-days-ago', 2500, daysAgoIso(6))
    insertRawSale(client, 'seven-days-ago', 9999, daysAgoIso(7)) // outside the window on both sides

    const referenceDate = new Date()
    const chart = getSalesChartData(client.db, '7days', referenceDate)
    const stats = getDashboardStats(client.db, '7days', referenceDate)

    const chartTotal = chart.reduce((sum, bucket) => sum + bucket.totalCents, 0)
    expect(chartTotal).toBe(stats.current.salesCents)
  })
})

describe('getPaymentMethodBreakdown', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-dashboard-paymentbreakdown-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('returns an empty array when there are no sales in the period', () => {
    expect(getPaymentMethodBreakdown(client.db, 'today')).toEqual([])
  })

  it('groups by payment method, summing totals and counting orders, ordered by total descending', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    const line: SaleLineInput = {
      productId: coke.id,
      productName: coke.name,
      unitPriceCents: coke.priceCents,
      quantity: 1
    }
    completeSale(client.db, [line], 'CASH') // 2000
    completeSale(client.db, [line], 'CASH') // 2000
    completeSale(client.db, [line], 'QR') // 2000
    completeSale(client.db, [{ ...line, quantity: 5 }], 'CARD') // 10000

    const result = getPaymentMethodBreakdown(client.db, 'today')
    expect(result).toEqual([
      { paymentMethod: 'CARD', totalCents: 10000, count: 1 },
      { paymentMethod: 'CASH', totalCents: 4000, count: 2 },
      { paymentMethod: 'QR', totalCents: 2000, count: 1 }
    ])
  })

  it('excludes VOID sales from the breakdown', () => {
    insertRawSale(client, 'void-sale', 5000, new Date().toISOString(), 'VOID', 'QR')
    expect(getPaymentMethodBreakdown(client.db, 'today')).toEqual([])
  })

  it("is scoped to the current period only, matching getDashboardStats' current window", () => {
    insertRawSale(client, 'yesterday-sale', 5000, daysAgoIso(1), 'COMPLETED', 'QR')
    expect(getPaymentMethodBreakdown(client.db, 'today')).toEqual([])
    const sevenDayResult = getPaymentMethodBreakdown(client.db, '7days')
    expect(sevenDayResult).toEqual([{ paymentMethod: 'QR', totalCents: 5000, count: 1 }])
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
    ], 'CASH')
    completeSale(client.db, [
      { productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 5 }
    ], 'CASH')

    const top = getTopProducts(client.db)
    expect(top[0]).toMatchObject({ productId: water.id, productName: 'Water', totalQuantity: 5, totalRevenueCents: 5000 })
    expect(top[1]).toMatchObject({ productId: coke.id, productName: 'Coke', totalQuantity: 2, totalRevenueCents: 4000 })
  })

  it('sums quantity across multiple sales of the same product', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 2 }
    ], 'CASH')
    completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 3 }
    ], 'CASH')

    const top = getTopProducts(client.db)
    expect(top).toHaveLength(1)
    expect(top[0].totalQuantity).toBe(5)
  })

  it('respects the limit', () => {
    const a = createProduct(client.db, { barcode: '1', name: 'A', priceCents: 100, stock: 50 })
    const b = createProduct(client.db, { barcode: '2', name: 'B', priceCents: 100, stock: 50 })
    const c = createProduct(client.db, { barcode: '3', name: 'C', priceCents: 100, stock: 50 })
    completeSale(client.db, [{ productId: a.id, productName: a.name, unitPriceCents: 100, quantity: 3 }], 'CASH')
    completeSale(client.db, [{ productId: b.id, productName: b.name, unitPriceCents: 100, quantity: 2 }], 'CASH')
    completeSale(client.db, [{ productId: c.id, productName: c.name, unitPriceCents: 100, quantity: 1 }], 'CASH')

    const top = getTopProducts(client.db, 2)
    expect(top).toHaveLength(2)
    expect(top.map((p) => p.productId)).toEqual([a.id, b.id])
  })

  it('returns an empty array when there are no sales', () => {
    expect(getTopProducts(client.db)).toEqual([])
  })
})

