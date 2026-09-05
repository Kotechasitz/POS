import { ipcMain } from 'electron'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { completeSale } from '../database/repositories/sale-repository'
import type { SaleLineInput, SaleRecord, PaymentMethod } from '../../shared/sale'

export function registerSaleHandlers(db: BetterSQLite3Database): void {
  ipcMain.handle(
    'sales:complete',
    (
      _event,
      items: SaleLineInput[],
      paymentMethod: PaymentMethod,
      discountCents: number
    ): SaleRecord => {
      return completeSale(db, items, paymentMethod, discountCents)
    }
  )
}
