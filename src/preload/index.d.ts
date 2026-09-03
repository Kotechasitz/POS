import { ElectronAPI } from '@electron-toolkit/preload'
import type { CreateProductInput, ProductRecord, UpdateProductInput } from '../shared/product'
import type { SaleLineInput, SaleRecord } from '../shared/sale'
import type { DashboardSummary, TopProduct, DailySales } from '../shared/dashboard'
import type { SaleListItem } from '../shared/salesHistory'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      dbHealth: () => Promise<{ productCount: number }>
      products: {
        list: (query?: string) => Promise<ProductRecord[]>
        create: (input: CreateProductInput) => Promise<ProductRecord>
        update: (id: string, input: UpdateProductInput) => Promise<ProductRecord>
        getByBarcode: (barcode: string) => Promise<ProductRecord | null>
      }
      sales: {
        complete: (items: SaleLineInput[]) => Promise<SaleRecord>
      }
      dashboard: {
        summary: () => Promise<DashboardSummary>
        topProducts: (limit?: number) => Promise<TopProduct[]>
        sevenDaySales: () => Promise<DailySales[]>
        lowStock: (threshold?: number) => Promise<ProductRecord[]>
      }
      salesHistory: {
        list: () => Promise<SaleListItem[]>
        detail: (saleId: string) => Promise<SaleRecord | null>
      }
    }
  }
}
