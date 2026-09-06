import { ipcMain, dialog } from 'electron'
import fs from 'node:fs'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { listSales, getSaleWithItems, voidSale } from '../database/repositories/sales-history-repository'
import { toCsv } from '../csv'
import { Money } from '../../shared/money'
import type { SaleListItem } from '../../shared/salesHistory'
import type { SaleRecord } from '../../shared/sale'

export function registerSalesHistoryHandlers(db: BetterSQLite3Database): void {
  ipcMain.handle('salesHistory:list', (): SaleListItem[] => {
    return listSales(db)
  })

  ipcMain.handle('salesHistory:detail', (_event, saleId: string): SaleRecord | null => {
    return getSaleWithItems(db, saleId) ?? null
  })

  ipcMain.handle('salesHistory:void', (_event, saleId: string, reason: string): SaleRecord => {
    return voidSale(db, saleId, reason)
  })

  ipcMain.handle(
    'salesHistory:exportCsv',
    async (_event, salesList: SaleListItem[]): Promise<{ canceled: boolean }> => {
      const result = await dialog.showSaveDialog({
        title: 'Export sales history',
        defaultPath: `sales-history-${new Date().toISOString().slice(0, 10)}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      })
      if (result.canceled || !result.filePath) {
        return { canceled: true }
      }

      const rows = salesList.map((item) => {
        const full = getSaleWithItems(db, item.id)
        const itemsText = full
          ? full.items.map((line) => `${line.quantity}x ${line.productName}`).join('; ')
          : ''
        const date = new Date(item.createdAt)
        return [
          `#${item.billNumber}`,
          date.toLocaleDateString(),
          date.toLocaleTimeString(),
          item.paymentMethod,
          itemsText,
          Money.fromCents(item.totalCents).format(),
          item.status
        ]
      })

      const csv = toCsv(['Bill #', 'Date', 'Time', 'Payment Method', 'Items', 'Total', 'Status'], rows)
      // Prepend a UTF-8 BOM so Excel on a non-UTF-8-default Windows locale
      // decodes non-ASCII content (Thai product names, the ฿ symbol from
      // Money.format()) correctly when the file is double-click-opened.
      fs.writeFileSync(result.filePath, '\uFEFF' + csv, 'utf-8')

      return { canceled: false }
    }
  )
}
