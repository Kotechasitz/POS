import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createDbClient } from '../src/main/database/client'
import { products } from '../src/main/database/schema'

const dbFile = path.resolve(process.cwd(), 'dev.db')
const migrationsFolder = path.resolve(process.cwd(), 'drizzle')
const { db, sqlite } = createDbClient(dbFile, migrationsFolder)

const now = new Date().toISOString()
const seedProducts = [
  { barcode: '8850001000012', name: 'Coca Cola', priceCents: 2000 },
  { barcode: '8850002000013', name: 'Water', priceCents: 1000 },
  { barcode: '8850003000014', name: 'Chips', priceCents: 3500 }
]

for (const p of seedProducts) {
  db.insert(products)
    .values({
      id: randomUUID(),
      barcode: p.barcode,
      name: p.name,
      priceCents: p.priceCents,
      stock: 50,
      isActive: true,
      createdAt: now,
      updatedAt: now
    })
    .onConflictDoNothing()
    .run()
}

console.log(`Seeded ${seedProducts.length} products into ${dbFile}`)
sqlite.close()
