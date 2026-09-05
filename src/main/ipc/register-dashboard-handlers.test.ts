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
import { createProduct } from '../database/repositories/product-repository'
import { completeSale } from '../database/repositories/sale-repository'
import type { DashboardSummary } from '../../shared/dashboard'

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

  it('registers all four dashboard channels', () => {
    expect(handlers.has('dashboard:summary')).toBe(true)
    expect(handlers.has('dashboard:topProducts')).toBe(true)
    expect(handlers.has('dashboard:sevenDaySales')).toBe(true)
    expect(handlers.has('dashboard:lowStock')).toBe(true)
  })

  it('dashboard:summary reflects a completed sale', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 2 }
    ], 'CASH')

    const summaryHandler = handlers.get('dashboard:summary')!
    const summary = summaryHandler({}) as DashboardSummary
    expect(summary).toEqual({ salesTodayCents: 4000, orderCountToday: 1, unitsSoldToday: 2 })
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
