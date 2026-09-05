import { eq, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { sales, saleItems, saleVoids } from '../schema'
import type { SaleListItem } from '../../../shared/salesHistory'
import type { SaleRecord, PaymentMethod } from '../../../shared/sale'

export function listSales(db: BetterSQLite3Database): SaleListItem[] {
  const rows = db
    .select({
      id: sales.id,
      totalCents: sales.totalCents,
      createdAt: sales.createdAt,
      status: sales.status,
      paymentMethod: sales.paymentMethod,
      itemCount: sql<number>`COUNT(${saleItems.id})`
    })
    .from(sales)
    .leftJoin(saleItems, eq(saleItems.saleId, sales.id))
    .groupBy(sales.id)
    .orderBy(sales.createdAt)
    .all()

  // Number oldest-to-newest (stable, creation-order bill numbers), then
  // reverse so the returned list itself is newest-first for display.
  return rows
    .map((row, index) => ({ ...row, paymentMethod: row.paymentMethod as PaymentMethod, billNumber: index + 1 }))
    .reverse()
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
  // A sale can only ever be voided once, so at most one row exists here.
  const voidRecord = db.select().from(saleVoids).where(eq(saleVoids.saleId, saleId)).get()
  return {
    id: sale.id,
    totalCents: sale.totalCents,
    status: sale.status,
    paymentMethod: sale.paymentMethod as PaymentMethod,
    discountCents: sale.discountCents,
    createdAt: sale.createdAt,
    items,
    ...(voidRecord ? { voidReason: voidRecord.reason, voidedAt: voidRecord.voidedAt } : {})
  }
}
