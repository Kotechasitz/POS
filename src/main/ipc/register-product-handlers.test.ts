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

import { registerProductHandlers } from './register-product-handlers'
import { createDbClient, type DbClient } from '../database/client'

describe('registerProductHandlers', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    handlers.clear()
    dbFile = path.join(os.tmpdir(), `pos-ipc-products-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../drizzle'))
    registerProductHandlers(client.db)
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('registers products:list, products:create, and products:update', () => {
    expect(handlers.has('products:list')).toBe(true)
    expect(handlers.has('products:create')).toBe(true)
    expect(handlers.has('products:update')).toBe(true)
  })

  it('products:create creates a product and products:list returns it', () => {
    const createHandler = handlers.get('products:create')!
    const listHandler = handlers.get('products:list')!

    const created = createHandler({}, { barcode: '999', name: 'Test', priceCents: 100, stock: 5 }) as {
      barcode: string
    }
    expect(created.barcode).toBe('999')

    const list = listHandler({}, undefined) as unknown[]
    expect(list).toHaveLength(1)
  })

  it('products:update updates a product', () => {
    const createHandler = handlers.get('products:create')!
    const updateHandler = handlers.get('products:update')!

    const created = createHandler({}, { barcode: '111', name: 'A', priceCents: 100, stock: 1 }) as {
      id: string
    }
    const updated = updateHandler({}, created.id, { stock: 99 }) as { stock: number }

    expect(updated.stock).toBe(99)
  })
})
