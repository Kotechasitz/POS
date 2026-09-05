import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const isMock = vi.hoisted(() => ({ dev: true }))
vi.mock('@electron-toolkit/utils', () => ({ is: isMock }))
vi.mock('electron', () => ({ app: { getPath: vi.fn() } }))

import { createDbClient, type DbClient } from '../client'
import { createProduct } from './product-repository'
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  CategoryValidationError,
  DuplicateCategoryNameError,
  CategoryNotFoundError,
  CategoryInUseError
} from './category-repository'

describe('category repository', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pos-category-repo-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../../drizzle'))
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('creates a category', () => {
    const category = createCategory(client.db, 'Beverages')
    expect(category.id).toBeDefined()
    expect(category.name).toBe('Beverages')
  })

  it('rejects an empty name', () => {
    expect(() => createCategory(client.db, '   ')).toThrow(CategoryValidationError)
  })

  it('rejects a duplicate name', () => {
    createCategory(client.db, 'Snacks')
    expect(() => createCategory(client.db, 'Snacks')).toThrow(DuplicateCategoryNameError)
  })

  it('lists categories', () => {
    createCategory(client.db, 'Beverages')
    createCategory(client.db, 'Snacks')
    expect(listCategories(client.db)).toHaveLength(2)
  })

  it('updates a category name', () => {
    const category = createCategory(client.db, 'Beverages')
    const updated = updateCategory(client.db, category.id, 'Drinks')
    expect(updated.name).toBe('Drinks')
  })

  it('rejects renaming a category to a name that already exists', () => {
    createCategory(client.db, 'Beverages')
    const second = createCategory(client.db, 'Snacks')
    expect(() => updateCategory(client.db, second.id, 'Beverages')).toThrow(
      DuplicateCategoryNameError
    )
  })

  it('throws CategoryNotFoundError when updating a nonexistent category', () => {
    expect(() => updateCategory(client.db, 'does-not-exist', 'X')).toThrow(CategoryNotFoundError)
  })

  it('deletes a category that has no products assigned', () => {
    const category = createCategory(client.db, 'Beverages')
    deleteCategory(client.db, category.id)
    expect(listCategories(client.db)).toHaveLength(0)
  })

  it('rejects deleting a category that still has products assigned, reporting the exact count', () => {
    const category = createCategory(client.db, 'Beverages')
    createProduct(client.db, {
      barcode: '111',
      name: 'Coke',
      priceCents: 2000,
      stock: 10,
      categoryId: category.id
    })
    createProduct(client.db, {
      barcode: '222',
      name: 'Water',
      priceCents: 1000,
      stock: 5,
      categoryId: category.id
    })

    expect(() => deleteCategory(client.db, category.id)).toThrow(CategoryInUseError)
    expect(() => deleteCategory(client.db, category.id)).toThrow(
      'Cannot delete "Beverages": 2 product(s) are still assigned to it'
    )
    expect(listCategories(client.db)).toHaveLength(1)
  })

  it('throws CategoryNotFoundError when deleting a nonexistent category', () => {
    expect(() => deleteCategory(client.db, 'does-not-exist')).toThrow(CategoryNotFoundError)
  })
})
