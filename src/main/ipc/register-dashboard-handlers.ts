import { ipcMain } from 'electron'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import {
  getDashboardSummary,
  getTopProducts,
  getSevenDaySales,
  getLowStockProducts
} from '../database/repositories/dashboard-repository'
import type { DashboardSummary, TopProduct, DailySales } from '../../shared/dashboard'
import type { ProductRecord } from '../../shared/product'

export function registerDashboardHandlers(db: BetterSQLite3Database): void {
  ipcMain.handle('dashboard:summary', (): DashboardSummary => {
    return getDashboardSummary(db)
  })

  ipcMain.handle('dashboard:topProducts', (_event, limit?: number): TopProduct[] => {
    return limit === undefined ? getTopProducts(db) : getTopProducts(db, limit)
  })

  ipcMain.handle('dashboard:sevenDaySales', (): DailySales[] => {
    return getSevenDaySales(db)
  })

  ipcMain.handle('dashboard:lowStock', (_event, threshold?: number): ProductRecord[] => {
    return threshold === undefined ? getLowStockProducts(db) : getLowStockProducts(db, threshold)
  })
}
