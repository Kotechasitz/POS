import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { products, sales, saleItems, stockTransactions } from '../schema'
import type { SaleLineInput, SaleItemRecord, SaleRecord } from '../../../shared/sale'
import { Money } from '../../../shared/money'
import { ProductNotFoundError } from './product-repository'

export class SaleValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SaleValidationError'
  }
}

export class EmptyCartError extends Error {
  constructor() {
    super('Cannot complete a sale with an empty cart')
    this.name = 'EmptyCartError'
  }
}

export class InsufficientStockError extends Error {
  constructor(productName: string, available: number, requested: number) {
    super(`Not enough stock for "${productName}": ${available} available, ${requested} requested`)
    this.name = 'InsufficientStockError'
  }
}

export class ProductNotAvailableError extends Error {
  constructor(productName: string) {
    super(`${productName} is not available for sale`)
    this.name = 'ProductNotAvailableError'
  }
}

function validateLine(line: SaleLineInput): void {
  if (!line.productId || line.productId.trim().length === 0) {
    throw new SaleValidationError('Sale line is missing a product id')
  }
  if (!Number.isInteger(line.quantity) || line.quantity < 1) {
    throw new SaleValidationError(
      `Sale line quantity must be a positive integer, got ${line.quantity}`
    )
  }
  if (!Number.isInteger(line.unitPriceCents) || line.unitPriceCents < 0) {
    throw new SaleValidationError(
      `Sale line price must be a non-negative integer, got ${line.unitPriceCents}`
    )
  }
}

export function completeSale(db: BetterSQLite3Database, items: SaleLineInput[]): SaleRecord {
  if (items.length === 0) {
    throw new EmptyCartError()
  }
  items.forEach(validateLine)

  // better-sqlite3 transactions are synchronous: this whole callback runs
  // inside one BEGIN/COMMIT, and throwing anywhere in it rolls everything
  // back, including writes made earlier in the same callback (spec §6.3 /
  // §11: never create a Sale successfully while failing to cut stock, and
  // never leave stock half-changed after a mid-transaction failure).
  return db.transaction((tx) => {
    const now = new Date().toISOString()
    const saleId = randomUUID()
    let total = Money.fromCents(0)

    const itemRecords: SaleItemRecord[] = items.map((line) => {
      const product = tx.select().from(products).where(eq(products.id, line.productId)).get()
      if (!product) {
        throw new ProductNotFoundError(line.productId)
      }
      if (!product.isActive) {
        throw new ProductNotAvailableError(product.name)
      }
      if (product.stock < line.quantity) {
        throw new InsufficientStockError(product.name, product.stock, line.quantity)
      }

      // Global Constraints: money math always goes through Money, never raw
      // +/* on cents.
      const lineTotal = Money.fromCents(line.unitPriceCents).multiply(line.quantity)
      const lineTotalCents = lineTotal.cents
      total = total.add(lineTotal)

      tx.update(products)
        .set({ stock: product.stock - line.quantity, updatedAt: now })
        .where(eq(products.id, line.productId))
        .run()

      // Negative quantity: this row records a deduction. Summing every
      // stock_transactions row for a product reconstructs its net stock
      // change from zero, so the sign must be consistent for future
      // (Phase 5+) audit/reporting queries.
      tx.insert(stockTransactions)
        .values({
          id: randomUUID(),
          productId: line.productId,
          type: 'SALE',
          quantity: -line.quantity,
          referenceId: saleId,
          createdAt: now
        })
        .run()

      return {
        id: randomUUID(),
        saleId,
        productId: line.productId,
        productName: line.productName,
        priceCents: line.unitPriceCents,
        quantity: line.quantity,
        totalCents: lineTotalCents
      }
    })

    tx.insert(sales)
      .values({ id: saleId, totalCents: total.cents, status: 'COMPLETED', createdAt: now })
      .run()

    itemRecords.forEach((item) => {
      tx.insert(saleItems).values(item).run()
    })

    return {
      id: saleId,
      totalCents: total.cents,
      status: 'COMPLETED',
      createdAt: now,
      items: itemRecords
    }
  })
}
