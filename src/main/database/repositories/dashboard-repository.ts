import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { products, sales, saleItems } from '../schema'
import type {
  DashboardPeriod,
  DashboardStats,
  PeriodStats,
  ChartBucket,
  PaymentMethodBreakdown,
  TopProduct
} from '../../../shared/dashboard'
import type { ProductRecord } from '../../../shared/product'
import type { PaymentMethod } from '../../../shared/sale'
import { Money } from '../../../shared/money'

// Computed with the local (OS) timezone deliberately — created_at is stored
// as UTC, but every period boundary below must mean the shop's local
// calendar day, not a UTC day.
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

interface PeriodWindow {
  currentStart: Date
  currentEnd: Date
  previousStart: Date
  previousEnd: Date
}

function getPeriodWindow(period: DashboardPeriod, referenceDate: Date): PeriodWindow {
  const todayStart = startOfDay(referenceDate)

  if (period === 'today') {
    return {
      currentStart: todayStart,
      currentEnd: addDays(todayStart, 1),
      previousStart: addDays(todayStart, -1),
      previousEnd: todayStart
    }
  }

  // '7days': the 7 local calendar days ending today (inclusive), vs. the 7
  // immediately before that window.
  const currentStart = addDays(todayStart, -6)
  return {
    currentStart,
    currentEnd: addDays(todayStart, 1),
    previousStart: addDays(currentStart, -7),
    previousEnd: currentStart
  }
}

function getPeriodStats(db: BetterSQLite3Database, start: Date, end: Date): PeriodStats {
  const windowSales = db
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

  const salesCents = windowSales
    .reduce((total, sale) => total.add(Money.fromCents(sale.totalCents)), Money.fromCents(0))
    .cents

  let unitsSold = 0
  if (windowSales.length > 0) {
    const saleIds = windowSales.map((sale) => sale.id)
    const items = db.select().from(saleItems).where(inArray(saleItems.saleId, saleIds)).all()
    unitsSold = items.reduce((sum, item) => sum + item.quantity, 0)
  }

  const orderCount = windowSales.length
  const avgOrderValueCents = orderCount > 0 ? Math.round(salesCents / orderCount) : 0

  return { salesCents, orderCount, unitsSold, avgOrderValueCents }
}

export function getDashboardStats(
  db: BetterSQLite3Database,
  period: DashboardPeriod,
  referenceDate: Date = new Date()
): DashboardStats {
  const window = getPeriodWindow(period, referenceDate)
  return {
    current: getPeriodStats(db, window.currentStart, window.currentEnd),
    previous: getPeriodStats(db, window.previousStart, window.previousEnd)
  }
}

export function getSalesChartData(
  db: BetterSQLite3Database,
  period: DashboardPeriod,
  referenceDate: Date = new Date()
): ChartBucket[] {
  if (period === 'today') {
    const dayStart = startOfDay(referenceDate)
    const buckets: ChartBucket[] = []
    for (let hour = 0; hour < 24; hour++) {
      const start = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(), hour)
      const end = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(), hour + 1)
      const stats = getPeriodStats(db, start, end)
      buckets.push({
        label: start.toLocaleTimeString(undefined, { hour: 'numeric' }),
        totalCents: stats.salesCents
      })
    }
    return buckets
  }

  // '7days'
  const buckets: ChartBucket[] = []
  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const start = addDays(startOfDay(referenceDate), -daysAgo)
    const end = addDays(start, 1)
    const stats = getPeriodStats(db, start, end)
    buckets.push({
      label: start.toLocaleDateString(undefined, { weekday: 'short' }),
      totalCents: stats.salesCents
    })
  }
  return buckets
}

export function getPaymentMethodBreakdown(
  db: BetterSQLite3Database,
  period: DashboardPeriod,
  referenceDate: Date = new Date()
): PaymentMethodBreakdown[] {
  const window = getPeriodWindow(period, referenceDate)

  const rows = db
    .select({
      paymentMethod: sales.paymentMethod,
      totalCents: sql<number>`SUM(${sales.totalCents})`,
      count: sql<number>`COUNT(*)`
    })
    .from(sales)
    .where(
      and(
        eq(sales.status, 'COMPLETED'),
        gte(sales.createdAt, window.currentStart.toISOString()),
        lt(sales.createdAt, window.currentEnd.toISOString())
      )
    )
    .groupBy(sales.paymentMethod)
    .orderBy(desc(sql`SUM(${sales.totalCents})`))
    .all()

  return rows.map((row) => ({
    paymentMethod: row.paymentMethod as PaymentMethod,
    totalCents: row.totalCents,
    count: row.count
  }))
}

export function getLowStockProducts(
  db: BetterSQLite3Database,
  threshold: number = 5
): ProductRecord[] {
  return db
    .select()
    .from(products)
    .where(and(eq(products.isActive, true), sql`${products.stock} <= ${threshold}`))
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
