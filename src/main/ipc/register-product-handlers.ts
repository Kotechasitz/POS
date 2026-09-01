import { ipcMain } from 'electron'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { createProduct, updateProduct, searchProducts } from '../database/repositories/product-repository'
import type { CreateProductInput, ProductRecord, UpdateProductInput } from '../../shared/product'

export function registerProductHandlers(db: BetterSQLite3Database): void {
  ipcMain.handle('products:list', (_event, query?: string): ProductRecord[] => {
    return searchProducts(db, query)
  })

  ipcMain.handle('products:create', (_event, input: CreateProductInput): ProductRecord => {
    return createProduct(db, input)
  })

  ipcMain.handle('products:update', (_event, id: string, input: UpdateProductInput): ProductRecord => {
    return updateProduct(db, id, input)
  })
}
