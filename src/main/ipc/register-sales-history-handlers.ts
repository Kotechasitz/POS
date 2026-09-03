import { ipcMain } from 'electron'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { listSales, getSaleWithItems } from '../database/repositories/sales-history-repository'
import type { SaleListItem } from '../../shared/salesHistory'
import type { SaleRecord } from '../../shared/sale'

export function registerSalesHistoryHandlers(db: BetterSQLite3Database): void {
  ipcMain.handle('salesHistory:list', (): SaleListItem[] => {
    return listSales(db)
  })

  ipcMain.handle('salesHistory:detail', (_event, saleId: string): SaleRecord | null => {
    return getSaleWithItems(db, saleId) ?? null
  })
}
