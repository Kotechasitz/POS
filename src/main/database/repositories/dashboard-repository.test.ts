import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createDbClient, type DbClient } from '../client'
import { sales, saleItems } from '../schema'
import { createProduct, updateProduct } from './product-repository'
import { completeSale } from './sale-repository'
import { getDashboardSummary, getLowStockProducts } from './dashboard-repository'
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
    const now = new Date().toISOString()
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
    void now
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
