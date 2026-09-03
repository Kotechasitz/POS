import { eq, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { sales, saleItems } from '../schema'
import type { SaleListItem } from '../../../shared/salesHistory'
import type { SaleRecord } from '../../../shared/sale'

export function listSales(db: BetterSQLite3Database): SaleListItem[] {
  const rows = db
    .select({
      id: sales.id,
      totalCents: sales.totalCents,
      createdAt: sales.createdAt,
      itemCount: sql<number>`COUNT(${saleItems.id})`
    })
    .from(sales)
    .leftJoin(saleItems, eq(saleItems.saleId, sales.id))
    .groupBy(sales.id)
    .orderBy(sales.createdAt)
    .all()

  // Number oldest-to-newest (stable, creation-order bill numbers), then
  // reverse so the returned list itself is newest-first for display.
  return rows.map((row, index) => ({ ...row, billNumber: index + 1 })).reverse()
}

export function getSaleWithItems(
  db: BetterSQLite3Database,
  saleId: string
): SaleRecord | undefined {
  const sale = db.select().from(sales).where(eq(sales.id, saleId)).get()
  if (!sale) {
    return undefined
  }
  const items = db.select().from(saleItems).where(eq(saleItems.saleId, saleId)).all()
  return {
    id: sale.id,
    totalCents: sale.totalCents,
    status: sale.status,
    createdAt: sale.createdAt,
    items
  }
}
