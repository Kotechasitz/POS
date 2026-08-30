import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      dbHealth: () => Promise<{ productCount: number }>
    }
  }
}
