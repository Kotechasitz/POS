import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const handlers = new Map<string, (...args: unknown[]) => unknown>()
const { showOpenDialog } = vi.hoisted(() => ({ showOpenDialog: vi.fn() }))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener)
    }
  },
  dialog: { showOpenDialog }
}))

import { registerImageHandlers } from './register-image-handlers'

describe('registerImageHandlers', () => {
  let sourceFile: string

  beforeEach(() => {
    handlers.clear()
    showOpenDialog.mockReset()
    registerImageHandlers()
    sourceFile = path.join(os.tmpdir(), `pos-image-handler-${Date.now()}-${Math.random()}.png`)
    fs.writeFileSync(sourceFile, 'fake-png-bytes')
  })

  afterEach(() => {
    if (fs.existsSync(sourceFile)) fs.rmSync(sourceFile)
  })

  it('registers the images:pickProductImage channel', () => {
    expect(handlers.has('images:pickProductImage')).toBe(true)
  })

  it('returns null when the dialog is cancelled', async () => {
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

    const result = await handlers.get('images:pickProductImage')!()

    expect(result).toBeNull()
  })

  it('returns null when the dialog resolves with no selected paths', async () => {
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] })

    const result = await handlers.get('images:pickProductImage')!()

    expect(result).toBeNull()
  })

  it('returns the picked path and a base64 preview data URL for a valid selection', async () => {
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [sourceFile] })

    const result = (await handlers.get('images:pickProductImage')!()) as {
      path: string
      previewDataUrl: string
    }

    expect(result.path).toBe(sourceFile)
    expect(result.previewDataUrl).toMatch(/^data:image\/png;base64,/)
    expect(result.previewDataUrl).toContain(Buffer.from('fake-png-bytes').toString('base64'))
  })

  it('throws a clean, actionable error instead of a raw fs error when the file cannot be read', async () => {
    const missingFile = path.join(os.tmpdir(), `pos-image-handler-missing-${Date.now()}.png`)
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [missingFile] })

    await expect(handlers.get('images:pickProductImage')!()).rejects.toThrow(
      'Could not read the selected image file. It may have moved or become unavailable — try picking it again.'
    )
  })
})
