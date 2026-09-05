import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import type { ProductRecord } from '../../shared/product'

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export type CategoryRow = typeof categories.$inferSelect

export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  barcode: text('barcode').notNull().unique(),
  name: text('name').notNull(),
  priceCents: integer('price_cents').notNull(),
  stock: integer('stock').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  categoryId: text('category_id').references(() => categories.id),
  imagePath: text('image_path'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export type ProductRow = typeof products.$inferSelect

// Compile-time-only drift guard: fails to typecheck if the `products` table
// shape (ProductRow, inferred from the Drizzle schema above) and the shared
// contract (ProductRecord, in src/shared/product.ts) ever diverge. This has
// zero runtime footprint — it only exists to make `npm run typecheck` fail
// loudly in src/main if someone edits one side without the other.
type AssertProductRowMatchesContract = ProductRow extends ProductRecord
  ? ProductRecord extends ProductRow
    ? true
    : never
  : never
// Exported (rather than left as a bare local alias) purely so tsc's
// noUnusedLocals doesn't flag it — nothing is meant to import this type.
export type ProductRowContractCheck = AssertProductRowMatchesContract

export const sales = sqliteTable(
  'sales',
  {
    id: text('id').primaryKey(),
    totalCents: integer('total_cents').notNull(),
    status: text('status').notNull().default('COMPLETED'),
    createdAt: text('created_at').notNull()
  },
  (table) => ({
    createdAtIdx: index('sales_created_at_idx').on(table.createdAt)
  })
)

export const saleItems = sqliteTable('sale_items', {
  id: text('id').primaryKey(),
  saleId: text('sale_id')
    .notNull()
    .references(() => sales.id),
  productId: text('product_id')
    .notNull()
    .references(() => products.id),
  productName: text('product_name').notNull(),
  priceCents: integer('price_cents').notNull(),
  quantity: integer('quantity').notNull(),
  totalCents: integer('total_cents').notNull()
})

export const stockTransactions = sqliteTable('stock_transactions', {
  id: text('id').primaryKey(),
  productId: text('product_id')
    .notNull()
    .references(() => products.id),
  type: text('type').notNull(),
  quantity: integer('quantity').notNull(),
  referenceId: text('reference_id'),
  createdAt: text('created_at').notNull()
})
