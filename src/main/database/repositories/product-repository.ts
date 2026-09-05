import { randomUUID } from 'node:crypto'
import { eq, like, or } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { products, categories } from '../schema'
import type { ProductRecord, CreateProductInput, UpdateProductInput } from '../../../shared/product'
import { storeProductImage, deleteProductImage } from '../../storage/product-images'

export class ProductValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProductValidationError'
  }
}

export class DuplicateBarcodeError extends Error {
  constructor(barcode: string) {
    super(`A product with barcode "${barcode}" already exists`)
    this.name = 'DuplicateBarcodeError'
  }
}

export class ProductNotFoundError extends Error {
  constructor(id: string) {
    super(`No product found with id "${id}"`)
    this.name = 'ProductNotFoundError'
  }
}

export class CategoryNotFoundOnProductError extends Error {
  constructor(categoryId: string) {
    super(`No category found with id "${categoryId}"`)
    this.name = 'CategoryNotFoundOnProductError'
  }
}

function validateBarcode(barcode: string): void {
  if (!barcode || barcode.trim().length === 0) {
    throw new ProductValidationError('Barcode is required')
  }
}

function validateName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new ProductValidationError('Product name is required')
  }
}

function validatePriceCents(priceCents: number): void {
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    throw new ProductValidationError('Price must be a non-negative integer number of satang')
  }
}

function validateStock(stock: number): void {
  if (!Number.isInteger(stock) || stock < 0) {
    throw new ProductValidationError('Stock must be a non-negative integer')
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('UNIQUE constraint failed')
}

function validateCategoryId(db: BetterSQLite3Database, categoryId: string | null | undefined): void {
  if (categoryId === null || categoryId === undefined) {
    return
  }
  const category = db.select().from(categories).where(eq(categories.id, categoryId)).get()
  if (!category) {
    throw new CategoryNotFoundOnProductError(categoryId)
  }
}

export function getProductById(db: BetterSQLite3Database, id: string): ProductRecord | undefined {
  return db.select().from(products).where(eq(products.id, id)).get() as ProductRecord | undefined
}

export function getProductByBarcode(
  db: BetterSQLite3Database,
  barcode: string
): ProductRecord | undefined {
  return db.select().from(products).where(eq(products.barcode, barcode)).get() as
    | ProductRecord
    | undefined
}

export function createProduct(db: BetterSQLite3Database, input: CreateProductInput): ProductRecord {
  validateBarcode(input.barcode)
  validateName(input.name)
  validatePriceCents(input.priceCents)
  validateStock(input.stock)
  validateCategoryId(db, input.categoryId)

  const imagePath = input.imageSourcePath ? storeProductImage(input.imageSourcePath) : null

  const now = new Date().toISOString()
  const record: ProductRecord = {
    id: randomUUID(),
    barcode: input.barcode.trim(),
    name: input.name.trim(),
    priceCents: input.priceCents,
    stock: input.stock,
    isActive: true,
    categoryId: input.categoryId ?? null,
    imagePath,
    createdAt: now,
    updatedAt: now
  }

  try {
    db.insert(products).values(record).run()
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new DuplicateBarcodeError(record.barcode)
    }
    throw err
  }

  return record
}

export function updateProduct(
  db: BetterSQLite3Database,
  id: string,
  input: UpdateProductInput
): ProductRecord {
  const existing = getProductById(db, id)
  if (!existing) {
    throw new ProductNotFoundError(id)
  }

  const next = {
    barcode: input.barcode !== undefined ? input.barcode : existing.barcode,
    name: input.name !== undefined ? input.name : existing.name,
    priceCents: input.priceCents !== undefined ? input.priceCents : existing.priceCents,
    stock: input.stock !== undefined ? input.stock : existing.stock,
    isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
    categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId
  }

  validateBarcode(next.barcode)
  validateName(next.name)
  validatePriceCents(next.priceCents)
  validateStock(next.stock)
  validateCategoryId(db, next.categoryId)

  // Image handling is independent of the other fields' undefined-means-
  // unchanged convention, because it has three distinct states to express
  // (leave alone / replace / clear), not two:
  let imagePath = existing.imagePath
  if (input.clearImage) {
    if (existing.imagePath) deleteProductImage(existing.imagePath)
    imagePath = null
  } else if (input.imageSourcePath) {
    if (existing.imagePath) deleteProductImage(existing.imagePath)
    imagePath = storeProductImage(input.imageSourcePath)
  }

  const barcode = next.barcode.trim()
  const name = next.name.trim()
  const updatedAt = new Date().toISOString()

  try {
    db.update(products)
      .set({
        barcode,
        name,
        priceCents: next.priceCents,
        stock: next.stock,
        isActive: next.isActive,
        categoryId: next.categoryId,
        imagePath,
        updatedAt
      })
      .where(eq(products.id, id))
      .run()
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new DuplicateBarcodeError(barcode)
    }
    throw err
  }

  return {
    ...existing,
    barcode,
    name,
    priceCents: next.priceCents,
    stock: next.stock,
    isActive: next.isActive,
    categoryId: next.categoryId,
    imagePath,
    updatedAt
  }
}

export function searchProducts(db: BetterSQLite3Database, query?: string): ProductRecord[] {
  if (!query || query.trim().length === 0) {
    return db.select().from(products).all() as ProductRecord[]
  }
  const pattern = `%${query.trim()}%`
  return db
    .select()
    .from(products)
    .where(or(like(products.barcode, pattern), like(products.name, pattern)))
    .all() as ProductRecord[]
}
