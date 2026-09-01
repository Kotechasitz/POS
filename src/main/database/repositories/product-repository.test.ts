import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createDbClient, type DbClient } from '../client'
import {
  createProduct,
  updateProduct,
  getProductById,
  searchProducts,
  ProductValidationError,
  DuplicateBarcodeError,
  ProductNotFoundError
} from './product-repository'

describe('product repository', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-product-repo-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('creates a product with the given fields, defaulting to active', () => {
    const product = createProduct(client.db, {
      barcode: '8850001000012',
      name: 'Coca Cola',
      priceCents: 2000,
      stock: 50
    })

    expect(product.id).toBeDefined()
    expect(product.barcode).toBe('8850001000012')
    expect(product.name).toBe('Coca Cola')
    expect(product.priceCents).toBe(2000)
    expect(product.stock).toBe(50)
    expect(product.isActive).toBe(true)
  })

  it('rejects creating a product with a duplicate barcode', () => {
    createProduct(client.db, { barcode: '111', name: 'A', priceCents: 100, stock: 1 })
    expect(() =>
      createProduct(client.db, { barcode: '111', name: 'B', priceCents: 200, stock: 2 })
    ).toThrow(DuplicateBarcodeError)
  })

  it('rejects a product with an empty name', () => {
    expect(() =>
      createProduct(client.db, { barcode: '222', name: '   ', priceCents: 100, stock: 1 })
    ).toThrow(ProductValidationError)
  })

  it('rejects a negative price', () => {
    expect(() =>
      createProduct(client.db, { barcode: '333', name: 'A', priceCents: -100, stock: 1 })
    ).toThrow(ProductValidationError)
  })

  it('rejects a non-integer stock', () => {
    expect(() =>
      createProduct(client.db, { barcode: '444', name: 'A', priceCents: 100, stock: 1.5 })
    ).toThrow(ProductValidationError)
  })

  it('updates a product and changes only the given fields', () => {
    const created = createProduct(client.db, { barcode: '555', name: 'A', priceCents: 100, stock: 1 })
    const updated = updateProduct(client.db, created.id, { priceCents: 150, stock: 10 })

    expect(updated.priceCents).toBe(150)
    expect(updated.stock).toBe(10)
    expect(updated.name).toBe('A')
    expect(updated.barcode).toBe('555')
  })

  it('rejects updating a product to a barcode that already exists on another product', () => {
    createProduct(client.db, { barcode: '666', name: 'A', priceCents: 100, stock: 1 })
    const second = createProduct(client.db, { barcode: '777', name: 'B', priceCents: 100, stock: 1 })

    expect(() => updateProduct(client.db, second.id, { barcode: '666' })).toThrow(DuplicateBarcodeError)
  })

  it('throws ProductNotFoundError when updating a nonexistent product', () => {
    expect(() => updateProduct(client.db, 'does-not-exist', { name: 'X' })).toThrow(ProductNotFoundError)
  })

  it('can deactivate a product without deleting it', () => {
    const created = createProduct(client.db, { barcode: '888', name: 'A', priceCents: 100, stock: 1 })
    const updated = updateProduct(client.db, created.id, { isActive: false })

    expect(updated.isActive).toBe(false)
    expect(getProductById(client.db, created.id)).toBeDefined()
  })

  it('searches products by barcode or name substring', () => {
    createProduct(client.db, { barcode: '8850001000012', name: 'Coca Cola', priceCents: 2000, stock: 50 })
    createProduct(client.db, { barcode: '8850002000013', name: 'Water', priceCents: 1000, stock: 50 })

    const byName = searchProducts(client.db, 'coca')
    expect(byName).toHaveLength(1)
    expect(byName[0].name).toBe('Coca Cola')

    const byBarcode = searchProducts(client.db, '8850002')
    expect(byBarcode).toHaveLength(1)
    expect(byBarcode[0].name).toBe('Water')

    expect(searchProducts(client.db)).toHaveLength(2)
    expect(searchProducts(client.db, 'nonexistent')).toHaveLength(0)
  })
})
