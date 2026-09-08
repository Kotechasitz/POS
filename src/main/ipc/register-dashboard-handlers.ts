import { ipcMain } from 'electron'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import {
  getDashboardStats,
  getSalesChartData,
  getPaymentMethodBreakdown,
  getTopProducts,
  getLowStockProducts
} from '../database/repositories/dashboard-repository'
import type {
  DashboardPeriod,
  DashboardStats,
  ChartBucket,
  PaymentMethodBreakdown,
  TopProduct
} from '../../shared/dashboard'
import type { ProductRecord } from '../../shared/product'

// The renderer fires stats/chartData/paymentBreakdown together for one
// period load (see useDashboard.ts) and passes the SAME instant to all
// three, so they can't disagree about "now" if a call happens to land on
// either side of local midnight. Each handler still defaults to `new
// Date()` when no instant is supplied, for direct callers/tests.
function resolveReferenceDate(referenceDateIso?: string): Date | undefined {
  return referenceDateIso ? new Date(referenceDateIso) : undefined
}

export function registerDashboardHandlers(db: BetterSQLite3Database): void {
  ipcMain.handle(
    'dashboard:stats',
    (_event, period: DashboardPeriod, referenceDateIso?: string): DashboardStats => {
      const referenceDate = resolveReferenceDate(referenceDateIso)
      return referenceDate ? getDashboardStats(db, period, referenceDate) : getDashboardStats(db, period)
    }
  )

  ipcMain.handle(
    'dashboard:chartData',
    (_event, period: DashboardPeriod, referenceDateIso?: string): ChartBucket[] => {
      const referenceDate = resolveReferenceDate(referenceDateIso)
      return referenceDate
        ? getSalesChartData(db, period, referenceDate)
        : getSalesChartData(db, period)
    }
  )

  ipcMain.handle(
    'dashboard:paymentBreakdown',
    (_event, period: DashboardPeriod, referenceDateIso?: string): PaymentMethodBreakdown[] => {
      const referenceDate = resolveReferenceDate(referenceDateIso)
      return referenceDate
        ? getPaymentMethodBreakdown(db, period, referenceDate)
        : getPaymentMethodBreakdown(db, period)
    }
  )

  ipcMain.handle('dashboard:topProducts', (_event, limit?: number): TopProduct[] => {
    return getTopProducts(db, limit)
  })

  ipcMain.handle('dashboard:lowStock', (_event, threshold?: number): ProductRecord[] => {
    return getLowStockProducts(db, threshold)
  })
}
