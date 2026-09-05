import { ipcMain } from 'electron'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory
} from '../database/repositories/category-repository'
import type { CategoryRecord } from '../../shared/category'

export function registerCategoryHandlers(db: BetterSQLite3Database): void {
  ipcMain.handle('categories:list', (): CategoryRecord[] => {
    return listCategories(db)
  })

  ipcMain.handle('categories:create', (_event, name: string): CategoryRecord => {
    return createCategory(db, name)
  })

  ipcMain.handle('categories:update', (_event, id: string, name: string): CategoryRecord => {
    return updateCategory(db, id, name)
  })

  ipcMain.handle('categories:delete', (_event, id: string): void => {
    deleteCategory(db, id)
  })
}
