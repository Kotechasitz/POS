import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { products } from './schema'

describe('database schema', () => {
  it('creates all six MVP tables', () => {
    const sqlite = new Database(':memory:')
    const db = drizzle(sqlite)
    migrate(db, { migrationsFolder: './drizzle' })

    const tables = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'"
      )
      .all()
      .map((row) => (row as { name: string }).name)
      .sort()

    expect(tables).toEqual([
      'categories',
      'products',
      'sale_items',
      'sale_voids',
      'sales',
      'stock_transactions'
    ])
    sqlite.close()
  })

  it('rejects a duplicate barcode', () => {
    const sqlite = new Database(':memory:')
    const db = drizzle(sqlite)
    migrate(db, { migrationsFolder: './drizzle' })

    const now = new Date().toISOString()
    db.insert(products)
      .values({
        id: 'p1',
        barcode: '8850001',
        name: 'Water',
        priceCents: 1000,
        stock: 10,
        isActive: true,
        createdAt: now,
        updatedAt: now
      })
      .run()

    expect(() =>
      db
        .insert(products)
        .values({
          id: 'p2',
          barcode: '8850001',
          name: 'Water 2',
          priceCents: 1200,
          stock: 5,
          isActive: true,
          createdAt: now,
          updatedAt: now
        })
        .run()
    ).toThrow(/UNIQUE constraint failed/)

    sqlite.close()
  })
})
