import { randomUUID } from 'node:crypto'
import { eq, count } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { categories, products } from '../schema'
import type { CategoryRecord } from '../../../shared/category'
import { isUniqueConstraintError } from '../db-errors'

export class CategoryValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CategoryValidationError'
  }
}

export class DuplicateCategoryNameError extends Error {
  constructor(name: string) {
    super(`A category named "${name}" already exists`)
    this.name = 'DuplicateCategoryNameError'
  }
}

export class CategoryNotFoundError extends Error {
  constructor(id: string) {
    super(`No category found with id "${id}"`)
    this.name = 'CategoryNotFoundError'
  }
}

export class CategoryInUseError extends Error {
  constructor(name: string, productCount: number) {
    super(`Cannot delete "${name}": ${productCount} product(s) are still assigned to it`)
    this.name = 'CategoryInUseError'
  }
}

function validateName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new CategoryValidationError('Category name is required')
  }
}

export function listCategories(db: BetterSQLite3Database): CategoryRecord[] {
  return db.select().from(categories).all() as CategoryRecord[]
}

export function createCategory(db: BetterSQLite3Database, name: string): CategoryRecord {
  validateName(name)
  const now = new Date().toISOString()
  const record: CategoryRecord = {
    id: randomUUID(),
    name: name.trim(),
    createdAt: now,
    updatedAt: now
  }
  try {
    db.insert(categories).values(record).run()
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new DuplicateCategoryNameError(record.name)
    }
    throw err
  }
  return record
}

export function updateCategory(
  db: BetterSQLite3Database,
  id: string,
  name: string
): CategoryRecord {
  const existing = db.select().from(categories).where(eq(categories.id, id)).get()
  if (!existing) {
    throw new CategoryNotFoundError(id)
  }
  validateName(name)
  const trimmedName = name.trim()
  const updatedAt = new Date().toISOString()
  try {
    db.update(categories).set({ name: trimmedName, updatedAt }).where(eq(categories.id, id)).run()
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new DuplicateCategoryNameError(trimmedName)
    }
    throw err
  }
  return { ...existing, name: trimmedName, updatedAt } as CategoryRecord
}

export function deleteCategory(db: BetterSQLite3Database, id: string): void {
  const existing = db.select().from(categories).where(eq(categories.id, id)).get()
  if (!existing) {
    throw new CategoryNotFoundError(id)
  }
  const [{ value: assignedCount }] = db
    .select({ value: count() })
    .from(products)
    .where(eq(products.categoryId, id))
    .all()
  if (assignedCount > 0) {
    throw new CategoryInUseError(existing.name, assignedCount)
  }
  db.delete(categories).where(eq(categories.id, id)).run()
}
