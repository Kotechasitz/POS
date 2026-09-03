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

import { registerSalesHistoryHandlers } from './register-sales-history-handlers'
import { createDbClient, type DbClient } from '../database/client'
import { createProduct } from '../database/repositories/product-repository'
import { completeSale } from '../database/repositories/sale-repository'

describe('registerSalesHistoryHandlers', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    handlers.clear()
    dbFile = path.join(os.tmpdir(), `pos-ipc-sales-history-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../drizzle'))
    registerSalesHistoryHandlers(client.db)
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('registers salesHistory:list and salesHistory:detail', () => {
    expect(handlers.has('salesHistory:list')).toBe(true)
    expect(handlers.has('salesHistory:detail')).toBe(true)
  })

  it('salesHistory:list returns completed sales', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 }
    ])

    const listHandler = handlers.get('salesHistory:list')!
    const list = listHandler({}) as unknown[]
    expect(list).toHaveLength(1)
  })

  it('salesHistory:detail returns the sale, or null when there is no match', () => {
    const coke = createProduct(client.db, { barcode: '111', name: 'Coke', priceCents: 2000, stock: 50 })
    const sale = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 }
    ])

    const detailHandler = handlers.get('salesHistory:detail')!
    const found = detailHandler({}, sale.id) as { id: string } | null
    expect(found?.id).toBe(sale.id)
    expect(detailHandler({}, 'nope')).toBeNull()
  })
})
