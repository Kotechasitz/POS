import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// This file's image storage must be isolated from product-images.test.ts's
// dev-mode directory: both would otherwise resolve getProductImagesPath() to
// the SAME physical path (path.resolve(process.cwd(), 'dev-product-images')),
// and product-images.test.ts's afterEach does a full recursive rmSync of that
// directory. Under Vitest's parallel file execution, that wipe can fire while
// this file still has stored images in flight, causing spurious failures.
// Mocking is.dev = false and app.getPath('userData') routes this file's
// image storage through a unique per-test-file temp directory instead.
const testUserDataDir = path.join(
  os.tmpdir(),
  `pos-product-repo-userdata-${Date.now()}-${process.pid}`
)
const isMock = vi.hoisted(() => ({ dev: false }))
vi.mock('@electron-toolkit/utils', () => ({ is: isMock }))
vi.mock('electron', () => ({ app: { getPath: vi.fn(() => testUserDataDir) } }))

import { createDbClient, type DbClient } from '../client'
import {
  createProduct,
  updateProduct,
  getProductById,
  getProductByBarcode,
  searchProducts,
  ProductValidationError,
  DuplicateBarcodeError,
  ProductNotFoundError,
  CategoryNotFoundOnProductError
} from './product-repository'
import { createCategory } from './category-repository'
import { getProductImagesPath } from '../db-path'
import { deleteProductImage } from '../../storage/product-images'

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

  afterAll(() => {
    if (fs.existsSync(testUserDataDir)) {
      fs.rmSync(testUserDataDir, { recursive: true, force: true })
    }
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
    const created = createProduct(client.db, {
      barcode: '555',
      name: 'A',
      priceCents: 100,
      stock: 1
    })
    const updated = updateProduct(client.db, created.id, { priceCents: 150, stock: 10 })

    expect(updated.priceCents).toBe(150)
    expect(updated.stock).toBe(10)
    expect(updated.name).toBe('A')
    expect(updated.barcode).toBe('555')
  })

  it('rejects updating a product to a barcode that already exists on another product', () => {
    createProduct(client.db, { barcode: '666', name: 'A', priceCents: 100, stock: 1 })
    const second = createProduct(client.db, {
      barcode: '777',
      name: 'B',
      priceCents: 100,
      stock: 1
    })

    expect(() => updateProduct(client.db, second.id, { barcode: '666' })).toThrow(
      DuplicateBarcodeError
    )
  })

  it('throws ProductNotFoundError when updating a nonexistent product', () => {
    expect(() => updateProduct(client.db, 'does-not-exist', { name: 'X' })).toThrow(
      ProductNotFoundError
    )
  })

  it('can deactivate a product without deleting it', () => {
    const created = createProduct(client.db, {
      barcode: '888',
      name: 'A',
      priceCents: 100,
      stock: 1
    })
    const updated = updateProduct(client.db, created.id, { isActive: false })

    expect(updated.isActive).toBe(false)
    expect(getProductById(client.db, created.id)).toBeDefined()
  })

  it('searches products by barcode or name substring', () => {
    createProduct(client.db, {
      barcode: '8850001000012',
      name: 'Coca Cola',
      priceCents: 2000,
      stock: 50
    })
    createProduct(client.db, {
      barcode: '8850002000013',
      name: 'Water',
      priceCents: 1000,
      stock: 50
    })

    const byName = searchProducts(client.db, 'coca')
    expect(byName).toHaveLength(1)
    expect(byName[0].name).toBe('Coca Cola')

    const byBarcode = searchProducts(client.db, '8850002')
    expect(byBarcode).toHaveLength(1)
    expect(byBarcode[0].name).toBe('Water')

    expect(searchProducts(client.db)).toHaveLength(2)
    expect(searchProducts(client.db, 'nonexistent')).toHaveLength(0)
  })

  it('finds a product by its exact barcode', () => {
    createProduct(client.db, {
      barcode: '8850001000012',
      name: 'Coca Cola',
      priceCents: 2000,
      stock: 50
    })

    const found = getProductByBarcode(client.db, '8850001000012')
    expect(found?.name).toBe('Coca Cola')
  })

  it('does not match a barcode substring, only an exact match', () => {
    createProduct(client.db, {
      barcode: '8850001000012',
      name: 'Coca Cola',
      priceCents: 2000,
      stock: 50
    })

    expect(getProductByBarcode(client.db, '885000100001')).toBeUndefined()
    expect(getProductByBarcode(client.db, '88500010000123')).toBeUndefined()
  })

  it('returns undefined for a barcode that does not exist', () => {
    expect(getProductByBarcode(client.db, 'does-not-exist')).toBeUndefined()
  })

  it('still returns an inactive product by barcode — callers decide whether inactive is sellable', () => {
    const created = createProduct(client.db, {
      barcode: '999',
      name: 'A',
      priceCents: 100,
      stock: 1
    })
    updateProduct(client.db, created.id, { isActive: false })

    const found = getProductByBarcode(client.db, '999')
    expect(found?.isActive).toBe(false)
  })

  it('creates a product with a category assigned', () => {
    const category = createCategory(client.db, 'Beverages')
    const product = createProduct(client.db, {
      barcode: '8850003000014',
      name: 'Water',
      priceCents: 1000,
      stock: 50,
      categoryId: category.id
    })
    expect(product.categoryId).toBe(category.id)
  })

  it('creates a product with no category when categoryId is omitted', () => {
    const product = createProduct(client.db, {
      barcode: '8850004000015',
      name: 'No Category Item',
      priceCents: 500,
      stock: 5
    })
    expect(product.categoryId).toBeNull()
  })

  it('rejects creating a product with a categoryId that does not exist', () => {
    expect(() =>
      createProduct(client.db, {
        barcode: '8850005000016',
        name: 'Bad Category',
        priceCents: 500,
        stock: 5,
        categoryId: 'does-not-exist'
      })
    ).toThrow(CategoryNotFoundOnProductError)
  })

  it('creates a product with an image, storing it under a new filename', () => {
    const sourceFile = path.join(os.tmpdir(), `pos-product-image-${Date.now()}.png`)
    fs.writeFileSync(sourceFile, 'fake-png-bytes')

    const product = createProduct(client.db, {
      barcode: '8850006000017',
      name: 'Has Image',
      priceCents: 1500,
      stock: 20,
      imageSourcePath: sourceFile
    })

    fs.rmSync(sourceFile)
    expect(product.imagePath).toMatch(/\.png$/)
    if (product.imagePath) deleteProductImage(product.imagePath)
  })

  it('updates a product to add a category', () => {
    const category = createCategory(client.db, 'Snacks')
    const created = createProduct(client.db, {
      barcode: '222',
      name: 'A',
      priceCents: 100,
      stock: 1
    })

    const updated = updateProduct(client.db, created.id, { categoryId: category.id })

    expect(updated.categoryId).toBe(category.id)
  })

  it('updates a product to clear its category by passing categoryId: null', () => {
    const category = createCategory(client.db, 'Snacks')
    const created = createProduct(client.db, {
      barcode: '333',
      name: 'A',
      priceCents: 100,
      stock: 1,
      categoryId: category.id
    })

    const updated = updateProduct(client.db, created.id, { categoryId: null })

    expect(updated.categoryId).toBeNull()
  })

  it('updates a product to replace its image, deleting the old stored file', () => {
    const firstSource = path.join(os.tmpdir(), `pos-product-image-a-${Date.now()}.png`)
    fs.writeFileSync(firstSource, 'first-image')
    const created = createProduct(client.db, {
      barcode: '444',
      name: 'A',
      priceCents: 100,
      stock: 1,
      imageSourcePath: firstSource
    })
    fs.rmSync(firstSource)
    const firstStoredPath = path.join(getProductImagesPath(), created.imagePath as string)
    expect(fs.existsSync(firstStoredPath)).toBe(true)

    const secondSource = path.join(os.tmpdir(), `pos-product-image-b-${Date.now()}.png`)
    fs.writeFileSync(secondSource, 'second-image')
    const updated = updateProduct(client.db, created.id, { imageSourcePath: secondSource })
    fs.rmSync(secondSource)

    expect(updated.imagePath).not.toBe(created.imagePath)
    expect(fs.existsSync(firstStoredPath)).toBe(false)
    if (updated.imagePath) deleteProductImage(updated.imagePath)
  })

  it('updates a product to clear its image with clearImage: true, deleting the stored file', () => {
    const sourceFile = path.join(os.tmpdir(), `pos-product-image-c-${Date.now()}.png`)
    fs.writeFileSync(sourceFile, 'image-bytes')
    const created = createProduct(client.db, {
      barcode: '555',
      name: 'A',
      priceCents: 100,
      stock: 1,
      imageSourcePath: sourceFile
    })
    fs.rmSync(sourceFile)
    const storedPath = path.join(getProductImagesPath(), created.imagePath as string)

    const updated = updateProduct(client.db, created.id, { clearImage: true })

    expect(updated.imagePath).toBeNull()
    expect(fs.existsSync(storedPath)).toBe(false)
  })

  it('does not delete the old image file when the update fails validation (e.g. duplicate barcode)', () => {
    const sourceFile = path.join(os.tmpdir(), `pos-product-image-fail-${Date.now()}.png`)
    fs.writeFileSync(sourceFile, 'image-bytes')
    const first = createProduct(client.db, {
      barcode: '666',
      name: 'A',
      priceCents: 100,
      stock: 1,
      imageSourcePath: sourceFile
    })
    fs.rmSync(sourceFile)
    createProduct(client.db, { barcode: '777', name: 'B', priceCents: 100, stock: 1 })
    const storedPath = path.join(getProductImagesPath(), first.imagePath as string)

    const otherSourceFile = path.join(os.tmpdir(), `pos-product-image-fail-2-${Date.now()}.png`)
    fs.writeFileSync(otherSourceFile, 'other-image-bytes')
    expect(() =>
      updateProduct(client.db, first.id, { barcode: '777', imageSourcePath: otherSourceFile })
    ).toThrow(DuplicateBarcodeError)
    fs.rmSync(otherSourceFile)

    const unchanged = getProductById(client.db, first.id)
    expect(unchanged?.imagePath).toBe(first.imagePath)
    expect(fs.existsSync(storedPath)).toBe(true)

    deleteProductImage(first.imagePath as string)
  })

  it('leaves an existing image untouched when updating an unrelated field', () => {
    const sourceFile = path.join(os.tmpdir(), `pos-product-image-untouched-${Date.now()}.png`)
    fs.writeFileSync(sourceFile, 'image-bytes')
    const created = createProduct(client.db, {
      barcode: '888',
      name: 'A',
      priceCents: 100,
      stock: 1,
      imageSourcePath: sourceFile
    })
    fs.rmSync(sourceFile)

    const updated = updateProduct(client.db, created.id, { stock: 99 })

    expect(updated.imagePath).toBe(created.imagePath)
    expect(fs.existsSync(path.join(getProductImagesPath(), created.imagePath as string))).toBe(true)

    deleteProductImage(created.imagePath as string)
  })
})
