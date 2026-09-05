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
      let buffer: Buffer
      try {
        buffer = fs.readFileSync(filePath)
      } catch {
        // The dialog already confirmed this path existed; something changed
        // between then and now (an ejected removable drive, a dropped
        // network share, a brief antivirus lock). Surface a clean, readable
        // message instead of a raw ENOENT/EBUSY leaking through the IPC
        // boundary with nothing for the shop owner to act on.
        throw new Error(
          'Could not read the selected image file. It may have moved or become unavailable — try picking it again.'
        )
      }
      const extension = filePath.split('.').pop()?.toLowerCase() ?? 'png'
      const mimeType = extension === 'jpg' ? 'jpeg' : extension
      const previewDataUrl = `data:image/${mimeType};base64,${buffer.toString('base64')}`

      return { path: filePath, previewDataUrl }
    }
  )
}
