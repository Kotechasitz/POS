import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { CreateProductInput, ProductRecord, UpdateProductInput } from '../shared/product'

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
