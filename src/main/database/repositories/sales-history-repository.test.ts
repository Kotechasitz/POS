import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createDbClient, type DbClient } from '../client'
import { createProduct } from './product-repository'
import { completeSale } from './sale-repository'
import { listSales, getSaleWithItems } from './sales-history-repository'

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
    ])
    const second = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 2 }
    ])

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
    ])
    const oneLineSale = completeSale(client.db, [
      { productId: coke.id, productName: coke.name, unitPriceCents: coke.priceCents, quantity: 1 }
    ])

    const list = listSales(client.db)
    const twoLine = list.find((s) => s.id === twoLineSale.id)
    const oneLine = list.find((s) => s.id === oneLineSale.id)
    expect(twoLine?.itemCount).toBe(2)
    expect(oneLine?.itemCount).toBe(1)
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
    ])

    const detail = getSaleWithItems(client.db, sale.id)
    expect(detail?.totalCents).toBe(6000)
    expect(detail?.status).toBe('COMPLETED')
    expect(detail?.items).toHaveLength(1)
    expect(detail?.items[0]).toMatchObject({ productName: 'Coke', quantity: 3, totalCents: 6000 })
  })

  it('returns undefined for a sale id that does not exist', () => {
    expect(getSaleWithItems(client.db, 'does-not-exist')).toBeUndefined()
  })
})
