import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { CreateProductInput, ProductRecord, UpdateProductInput } from '../shared/product'
import type { CategoryRecord } from '../shared/category'
import type { SaleLineInput, SaleRecord, PaymentMethod } from '../shared/sale'
import type { DashboardSummary, TopProduct, DailySales } from '../shared/dashboard'
import type { SaleListItem } from '../shared/salesHistory'

// Custom APIs for renderer
const api = {
  dbHealth: (): Promise<{ productCount: number }> => ipcRenderer.invoke('db:health'),
  products: {
    list: (query?: string): Promise<ProductRecord[]> => ipcRenderer.invoke('products:list', query),
    create: (input: CreateProductInput): Promise<ProductRecord> =>
      ipcRenderer.invoke('products:create', input),
    update: (id: string, input: UpdateProductInput): Promise<ProductRecord> =>
      ipcRenderer.invoke('products:update', id, input),
    getByBarcode: (barcode: string): Promise<ProductRecord | null> =>
      ipcRenderer.invoke('products:getByBarcode', barcode)
  },
  categories: {
    list: (): Promise<CategoryRecord[]> => ipcRenderer.invoke('categories:list'),
    create: (name: string): Promise<CategoryRecord> => ipcRenderer.invoke('categories:create', name),
    update: (id: string, name: string): Promise<CategoryRecord> =>
      ipcRenderer.invoke('categories:update', id, name),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('categories:delete', id)
  },
  sales: {
    complete: (
      items: SaleLineInput[],
      paymentMethod: PaymentMethod,
      discountCents: number
    ): Promise<SaleRecord> => ipcRenderer.invoke('sales:complete', items, paymentMethod, discountCents)
  },
  dashboard: {
    summary: (): Promise<DashboardSummary> => ipcRenderer.invoke('dashboard:summary'),
    topProducts: (limit?: number): Promise<TopProduct[]> =>
      ipcRenderer.invoke('dashboard:topProducts', limit),
    sevenDaySales: (): Promise<DailySales[]> => ipcRenderer.invoke('dashboard:sevenDaySales'),
    lowStock: (threshold?: number): Promise<ProductRecord[]> =>
      ipcRenderer.invoke('dashboard:lowStock', threshold)
  },
  salesHistory: {
    list: (): Promise<SaleListItem[]> => ipcRenderer.invoke('salesHistory:list'),
    detail: (saleId: string): Promise<SaleRecord | null> =>
      ipcRenderer.invoke('salesHistory:detail', saleId),
    void: (saleId: string, reason: string): Promise<SaleRecord> =>
      ipcRenderer.invoke('salesHistory:void', saleId, reason),
    exportCsv: (sales: SaleListItem[]): Promise<{ canceled: boolean }> =>
      ipcRenderer.invoke('salesHistory:exportCsv', sales)
  },
  images: {
    pickProductImage: (): Promise<{ path: string; previewDataUrl: string } | null> =>
      ipcRenderer.invoke('images:pickProductImage')
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
