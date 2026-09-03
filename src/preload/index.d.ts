import { ElectronAPI } from '@electron-toolkit/preload'
import type { CreateProductInput, ProductRecord, UpdateProductInput } from '../shared/product'
import type { SaleLineInput, SaleRecord } from '../shared/sale'

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
    }
  }
}
