import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener)
    }
  }
}))

import { registerSaleHandlers } from './register-sale-handlers'
import { createDbClient, type DbClient } from '../database/client'
import { createProduct } from '../database/repositories/product-repository'
import type { SaleLineInput, SaleRecord } from '../../shared/sale'

describe('registerSaleHandlers', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    handlers.clear()
    dbFile = path.join(os.tmpdir(), `pos-ipc-sales-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../drizzle'))
    registerSaleHandlers(client.db)
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('registers sales:complete', () => {
    expect(handlers.has('sales:complete')).toBe(true)
  })

  it('sales:complete completes a sale and decrements stock', () => {
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 5 })
    const completeHandler = handlers.get('sales:complete')!

    const line: SaleLineInput = {
      productId: water.id,
      productName: water.name,
      unitPriceCents: water.priceCents,
      quantity: 2
    }
    const sale = completeHandler({}, [line]) as SaleRecord

    expect(sale.totalCents).toBe(2000)
    expect(sale.items).toHaveLength(1)
  })

  it('sales:complete propagates an error for an insufficient-stock line', () => {
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 1 })
    const completeHandler = handlers.get('sales:complete')!

    const line: SaleLineInput = {
      productId: water.id,
      productName: water.name,
      unitPriceCents: water.priceCents,
      quantity: 2
    }
    expect(() => completeHandler({}, [line])).toThrow()
  })
})
