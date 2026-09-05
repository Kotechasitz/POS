import { ipcMain, dialog } from 'electron'
import fs from 'node:fs'

export function registerImageHandlers(): void {
  ipcMain.handle(
    'images:pickProductImage',
    async (): Promise<{ path: string; previewDataUrl: string } | null> => {
      const result = await dialog.showOpenDialog({
        title: 'Select product image',
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
        properties: ['openFile']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const filePath = result.filePaths[0]
      const buffer = fs.readFileSync(filePath)
      const extension = filePath.split('.').pop()?.toLowerCase() ?? 'png'
      const mimeType = extension === 'jpg' ? 'jpeg' : extension
      const previewDataUrl = `data:image/${mimeType};base64,${buffer.toString('base64')}`

      return { path: filePath, previewDataUrl }
    }
  )
}
