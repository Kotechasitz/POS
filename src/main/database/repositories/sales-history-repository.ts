import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { sales, saleItems, saleVoids, products, stockTransactions } from '../schema'
import type { SaleListItem } from '../../../shared/salesHistory'
import type { SaleRecord, PaymentMethod, SaleStatus } from '../../../shared/sale'
import { SaleValidationError } from './sale-repository'
import { ProductNotFoundError } from './product-repository'

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
    .map((row, index) => ({
      ...row,
      status: row.status as SaleStatus,
      paymentMethod: row.paymentMethod as PaymentMethod,
      billNumber: index + 1
    }))
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
    status: sale.status as SaleStatus,
    paymentMethod: sale.paymentMethod as PaymentMethod,
    discountCents: sale.discountCents,
    createdAt: sale.createdAt,
    items,
    ...(voidRecord ? { voidReason: voidRecord.reason, voidedAt: voidRecord.voidedAt } : {})
  }
}

export class SaleNotFoundError extends Error {
  constructor(id: string) {
    super(`No sale found with id "${id}"`)
    this.name = 'SaleNotFoundError'
  }
}

export class SaleAlreadyVoidError extends Error {
  constructor(id: string) {
    super(`Sale "${id}" has already been voided`)
    this.name = 'SaleAlreadyVoidError'
  }
}

export function voidSale(db: BetterSQLite3Database, saleId: string, reason: string): SaleRecord {
  if (!reason || reason.trim().length === 0) {
    throw new SaleValidationError('A reason is required to void a sale')
  }
  const trimmedReason = reason.trim()

  // Same atomicity mechanism completeSale relies on: this whole callback
  // runs inside one BEGIN/COMMIT, and throwing anywhere in it — including
  // partway through returning stock for a multi-line sale — rolls
  // everything in this callback back together.
  return db.transaction((tx) => {
    const sale = tx.select().from(sales).where(eq(sales.id, saleId)).get()
    if (!sale) {
      throw new SaleNotFoundError(saleId)
    }
    if (sale.status !== 'COMPLETED') {
      throw new SaleAlreadyVoidError(saleId)
    }

    const now = new Date().toISOString()
    const items = tx.select().from(saleItems).where(eq(saleItems.saleId, saleId)).all()

    items.forEach((item) => {
      const product = tx.select().from(products).where(eq(products.id, item.productId)).get()
      if (!product) {
        throw new ProductNotFoundError(item.productId)
      }

      tx.update(products)
        .set({ stock: product.stock + item.quantity, updatedAt: now })
        .where(eq(products.id, item.productId))
        .run()

      // Positive quantity: this row records a return, the mirror image of
      // completeSale's negative SALE rows — the sign is what keeps
      // SUM(quantity) meaningful as a running stock reconstruction.
      tx.insert(stockTransactions)
        .values({
          id: randomUUID(),
          productId: item.productId,
          type: 'VOID',
          quantity: item.quantity,
          referenceId: saleId,
          createdAt: now
        })
        .run()
    })

    tx.update(sales).set({ status: 'VOID' }).where(eq(sales.id, saleId)).run()

    tx.insert(saleVoids)
      .values({ id: randomUUID(), saleId, reason: trimmedReason, voidedAt: now })
      .run()

    return {
      id: sale.id,
      totalCents: sale.totalCents,
      status: 'VOID',
      paymentMethod: sale.paymentMethod as PaymentMethod,
      discountCents: sale.discountCents,
      createdAt: sale.createdAt,
      items: items as SaleRecord['items'],
      voidReason: trimmedReason,
      voidedAt: now
    }
  })
}
