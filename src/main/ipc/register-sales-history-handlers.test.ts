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
  app: { getPath: vi.fn() },
  dialog: { showSaveDialog: vi.fn() }
}))

import { dialog } from 'electron'
import { registerSalesHistoryHandlers } from './register-sales-history-handlers'
import { createDbClient, type DbClient } from '../database/client'
import { createProduct, getProductById } from '../database/repositories/product-repository'
import { completeSale } from '../database/repositories/sale-repository'
import { SaleAlreadyVoidError } from '../database/repositories/sales-history-repository'
import type { SaleRecord } from '../../shared/sale'

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
    const coke = createProduct(client.db, {
      barcode: '111',
      name: 'Coke',
      priceCents: 2000,
      stock: 50
    })
    completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 }
    ], 'CASH')

    const listHandler = handlers.get('salesHistory:list')!
    const list = listHandler({}) as unknown[]
    expect(list).toHaveLength(1)
  })

  it('salesHistory:detail returns the sale, or null when there is no match', () => {
    const coke = createProduct(client.db, {
      barcode: '111',
      name: 'Coke',
      priceCents: 2000,
      stock: 50
    })
    const sale = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 }
    ], 'CASH')

    const detailHandler = handlers.get('salesHistory:detail')!
    const found = detailHandler({}, sale.id) as { id: string } | null
    expect(found?.id).toBe(sale.id)
    expect(detailHandler({}, 'nope')).toBeNull()
  })

  it('registers salesHistory:void and salesHistory:exportCsv', () => {
    expect(handlers.has('salesHistory:void')).toBe(true)
    expect(handlers.has('salesHistory:exportCsv')).toBe(true)
  })

  it('salesHistory:void voids a sale and returns stock', () => {
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 5 })
    const sale = completeSale(
      client.db,
      [{ productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 2 }],
      'CASH'
    )
    const stockAfterSale = getProductById(client.db, water.id)?.stock
    expect(stockAfterSale).toBe(3)

    const voidHandler = handlers.get('salesHistory:void')!
    const voided = voidHandler({}, sale.id, 'Customer changed their mind') as SaleRecord

    expect(voided.status).toBe('VOID')
    expect(voided.voidReason).toBe('Customer changed their mind')
    expect(getProductById(client.db, water.id)?.stock).toBe(5)
  })

  it('salesHistory:void propagates SaleAlreadyVoidError on a second void', () => {
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 5 })
    const sale = completeSale(
      client.db,
      [{ productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 1 }],
      'CASH'
    )
    const voidHandler = handlers.get('salesHistory:void')!
    voidHandler({}, sale.id, 'First void')

    expect(() => voidHandler({}, sale.id, 'Second attempt')).toThrow(SaleAlreadyVoidError)
  })

  it('salesHistory:exportCsv writes a CSV file to the path the save dialog returns', async () => {
    const water = createProduct(client.db, { barcode: '222', name: 'Water', priceCents: 1000, stock: 5 })
    const sale = completeSale(
      client.db,
      [{ productId: water.id, productName: water.name, unitPriceCents: water.priceCents, quantity: 2 }],
      'CASH'
    )
    const listItem = { ...sale, billNumber: 1, itemCount: 1 }
    const tmpPath = path.join(os.tmpdir(), `pos-export-${Date.now()}.csv`)
    ;(dialog.showSaveDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
      canceled: false,
      filePath: tmpPath
    })

    const exportHandler = handlers.get('salesHistory:exportCsv')!
    const result = await exportHandler({}, [listItem])

    expect(result).toEqual({ canceled: false })
    const written = fs.readFileSync(tmpPath, 'utf-8')
    expect(written.startsWith('\uFEFF')).toBe(true)
    expect(written).toContain('Bill #,Date,Time,Payment Method,Items,Total,Status')
    expect(written).toContain('2x Water')
    fs.rmSync(tmpPath)
  })

  it('salesHistory:exportCsv returns canceled: true and writes nothing when the save dialog is dismissed', async () => {
    ;(dialog.showSaveDialog as ReturnType<typeof vi.fn>).mockResolvedValue({ canceled: true })

    const exportHandler = handlers.get('salesHistory:exportCsv')!
    const result = await exportHandler({}, [])

    expect(result).toEqual({ canceled: true })
  })
})
