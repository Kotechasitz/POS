import { ElectronAPI } from '@electron-toolkit/preload'
import type { CreateProductInput, ProductRecord, UpdateProductInput } from '../shared/product'
import type { CategoryRecord } from '../shared/category'
import type { SaleLineInput, SaleRecord, PaymentMethod } from '../shared/sale'
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
      categories: {
        list: () => Promise<CategoryRecord[]>
        create: (name: string) => Promise<CategoryRecord>
        update: (id: string, name: string) => Promise<CategoryRecord>
        delete: (id: string) => Promise<void>
      }
      sales: {
        complete: (
          items: SaleLineInput[],
          paymentMethod: PaymentMethod,
          discountCents: number
        ) => Promise<SaleRecord>
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
        void: (saleId: string, reason: string) => Promise<SaleRecord>
        exportCsv: (sales: SaleListItem[]) => Promise<{ canceled: boolean }>
      }
      images: {
        pickProductImage: () => Promise<{ path: string; previewDataUrl: string } | null>
      }
    }
  }
}
