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

export function registerDashboardHandlers(db: BetterSQLite3Database): void {
  ipcMain.handle('dashboard:stats', (_event, period: DashboardPeriod): DashboardStats => {
    return getDashboardStats(db, period)
  })

  ipcMain.handle('dashboard:chartData', (_event, period: DashboardPeriod): ChartBucket[] => {
    return getSalesChartData(db, period)
  })

  ipcMain.handle(
    'dashboard:paymentBreakdown',
    (_event, period: DashboardPeriod): PaymentMethodBreakdown[] => {
      return getPaymentMethodBreakdown(db, period)
    }
  )

  ipcMain.handle('dashboard:topProducts', (_event, limit?: number): TopProduct[] => {
    return getTopProducts(db, limit)
  })

  ipcMain.handle('dashboard:lowStock', (_event, threshold?: number): ProductRecord[] => {
    return getLowStockProducts(db, threshold)
  })
}
