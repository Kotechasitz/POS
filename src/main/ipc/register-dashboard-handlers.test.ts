import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const handlers = new Map<string, (...args: unknown[]) => unknown>()
const isMock = vi.hoisted(() => ({ dev: true }))

vi.mock('@electron-toolkit/utils', () => ({ is: isMock }))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener)
    }
  },
  app: { getPath: vi.fn() }
}))

import { registerDashboardHandlers } from './register-dashboard-handlers'
import { createDbClient, type DbClient } from '../database/client'
import { sales } from '../database/schema'
import { createProduct } from '../database/repositories/product-repository'
import { completeSale } from '../database/repositories/sale-repository'
import type { DashboardStats, ChartBucket, PaymentMethodBreakdown } from '../../shared/dashboard'

describe('registerDashboardHandlers', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    handlers.clear()
    dbFile = path.join(os.tmpdir(), `pos-ipc-dashboard-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../drizzle'))
    registerDashboardHandlers(client.db)
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('registers all five dashboard channels', () => {
    expect(handlers.has('dashboard:stats')).toBe(true)
    expect(handlers.has('dashboard:chartData')).toBe(true)
    expect(handlers.has('dashboard:paymentBreakdown')).toBe(true)
    expect(handlers.has('dashboard:topProducts')).toBe(true)
    expect(handlers.has('dashboard:lowStock')).toBe(true)
  })

  it("dashboard:stats reflects a completed sale for period 'today'", () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 2 }
    ], 'CASH')

    const statsHandler = handlers.get('dashboard:stats')!
    const stats = statsHandler({}, 'today') as DashboardStats
    expect(stats.current).toEqual({
      salesCents: 4000,
      orderCount: 1,
      unitsSold: 2,
      avgOrderValueCents: 4000
    })
  })

  it("dashboard:chartData returns 24 buckets for 'today' and 7 for '7days'", () => {
    const chartDataHandler = handlers.get('dashboard:chartData')!
    expect((chartDataHandler({}, 'today') as ChartBucket[])).toHaveLength(24)
    expect((chartDataHandler({}, '7days') as ChartBucket[])).toHaveLength(7)
  })

  it('dashboard:paymentBreakdown reflects a completed sale', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 }
    ], 'QR')

    const breakdownHandler = handlers.get('dashboard:paymentBreakdown')!
    const result = breakdownHandler({}, 'today') as PaymentMethodBreakdown[]
    expect(result).toEqual([{ paymentMethod: 'QR', totalCents: 2000, count: 1 }])
  })

  it('dashboard:stats and dashboard:chartData both honor an explicit referenceDateIso, so a caller can pin every period-scoped call to the same instant', () => {
    // A sale placed on a fixed, arbitrary past date — only visible to a
    // handler call that actually used that date as "today", not the real
    // current date.
    const pinnedDate = new Date(2020, 0, 15, 10, 0, 0)
    client.db
      .insert(sales)
      .values({
        id: 'pinned-sale',
        totalCents: 4000,
        status: 'COMPLETED',
        paymentMethod: 'CASH',
        createdAt: pinnedDate.toISOString()
      })
      .run()

    const referenceDateIso = pinnedDate.toISOString()
    const statsHandler = handlers.get('dashboard:stats')!
    const chartDataHandler = handlers.get('dashboard:chartData')!

    const statsForPinnedDate = statsHandler({}, 'today', referenceDateIso) as DashboardStats
    expect(statsForPinnedDate.current.salesCents).toBe(4000)

    const chartForPinnedDate = chartDataHandler({}, 'today', referenceDateIso) as ChartBucket[]
    expect(chartForPinnedDate.reduce((sum, bucket) => sum + bucket.totalCents, 0)).toBe(4000)

    // Without a referenceDateIso, both fall back to the real "now" and
    // don't see the pinned-past sale.
    const statsForNow = statsHandler({}, 'today') as DashboardStats
    expect(statsForNow.current.salesCents).toBe(0)
  })

  it('dashboard:topProducts passes a given limit through', () => {
    const a = createProduct(client.db, { barcode: '1', name: 'A', priceCents: 100, stock: 50 })
    const b = createProduct(client.db, { barcode: '2', name: 'B', priceCents: 100, stock: 50 })
    completeSale(client.db, [{ productId: a.id, productName: a.name, unitPriceCents: 100, quantity: 2 }], 'CASH')
    completeSale(client.db, [{ productId: b.id, productName: b.name, unitPriceCents: 100, quantity: 1 }], 'CASH')

    const topProductsHandler = handlers.get('dashboard:topProducts')!
    const result = topProductsHandler({}, 1) as unknown[]
    expect(result).toHaveLength(1)
  })

  it('dashboard:lowStock passes a given threshold through', () => {
    createProduct(client.db, { barcode: '333', name: 'Scarce', priceCents: 100, stock: 2 })
    createProduct(client.db, { barcode: '444', name: 'Plenty', priceCents: 100, stock: 20 })

    const lowStockHandler = handlers.get('dashboard:lowStock')!
    const result = lowStockHandler({}, 3) as unknown[]
    expect(result).toHaveLength(1)
  })
})
