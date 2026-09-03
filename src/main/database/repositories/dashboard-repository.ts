import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { products, sales, saleItems } from '../schema'
import type { DashboardSummary, TopProduct, DailySales } from '../../../shared/dashboard'
import type { ProductRecord } from '../../../shared/product'
import { Money } from '../../../shared/money'

// Computed with the local (OS) timezone deliberately — see the plan's
// Global Constraints: created_at is stored as UTC, but "today" must mean
// the shop's local calendar day, not a UTC day.
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function getDashboardSummary(
  db: BetterSQLite3Database,
  referenceDate: Date = new Date()
): DashboardSummary {
  const start = startOfDay(referenceDate)
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)

  const todaysSales = db
    .select()
    .from(sales)
    .where(
      and(
        eq(sales.status, 'COMPLETED'),
        gte(sales.createdAt, start.toISOString()),
        lt(sales.createdAt, end.toISOString())
      )
    )
    .all()

  const salesTodayCents = todaysSales
    .reduce((total, sale) => total.add(Money.fromCents(sale.totalCents)), Money.fromCents(0))
    .cents

  let unitsSoldToday = 0
  if (todaysSales.length > 0) {
    const saleIds = todaysSales.map((sale) => sale.id)
    const items = db.select().from(saleItems).where(inArray(saleItems.saleId, saleIds)).all()
    unitsSoldToday = items.reduce((sum, item) => sum + item.quantity, 0)
  }

  return {
    salesTodayCents,
    orderCountToday: todaysSales.length,
    unitsSoldToday
  }
}

export function getLowStockProducts(
  db: BetterSQLite3Database,
  threshold: number = 5
): ProductRecord[] {
  return db
    .select()
    .from(products)
    .where(and(eq(products.isActive, true), lte(products.stock, threshold)))
    .orderBy(asc(products.stock))
    .all() as ProductRecord[]
}

export function getTopProducts(db: BetterSQLite3Database, limit: number = 5): TopProduct[] {
  return db
    .select({
      productId: saleItems.productId,
      productName: products.name,
      totalQuantity: sql<number>`SUM(${saleItems.quantity})`,
      totalRevenueCents: sql<number>`SUM(${saleItems.totalCents})`
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .innerJoin(products, eq(saleItems.productId, products.id))
    .where(eq(sales.status, 'COMPLETED'))
    .groupBy(saleItems.productId, products.name)
    .orderBy(desc(sql`SUM(${saleItems.quantity})`))
    .limit(limit)
    .all()
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getSevenDaySales(
  db: BetterSQLite3Database,
  referenceDate: Date = new Date()
): DailySales[] {
  const results: DailySales[] = []

  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const day = new Date(referenceDate)
    day.setDate(day.getDate() - daysAgo)
    const start = startOfDay(day)
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)

    const daysSales = db
      .select()
      .from(sales)
      .where(
        and(
          eq(sales.status, 'COMPLETED'),
          gte(sales.createdAt, start.toISOString()),
          lt(sales.createdAt, end.toISOString())
        )
      )
      .all()

    const totalCents = daysSales
      .reduce((total, sale) => total.add(Money.fromCents(sale.totalCents)), Money.fromCents(0))
      .cents

    results.push({ date: formatDateOnly(start), totalCents })
  }

  return results
}
