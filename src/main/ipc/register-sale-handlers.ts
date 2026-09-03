import { ipcMain } from 'electron'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { completeSale } from '../database/repositories/sale-repository'
import type { SaleLineInput, SaleRecord } from '../../shared/sale'

export function registerSaleHandlers(db: BetterSQLite3Database): void {
  ipcMain.handle('sales:complete', (_event, items: SaleLineInput[]): SaleRecord => {
    return completeSale(db, items)
  })
}
