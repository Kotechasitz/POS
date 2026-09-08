import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const isMock = vi.hoisted(() => ({ dev: true }))
vi.mock('@electron-toolkit/utils', () => ({ is: isMock }))
vi.mock('electron', () => ({ app: { getPath: vi.fn() } }))

import { storeProductImage, deleteProductImage, UnsupportedImageTypeError } from './product-images'
import { getProductImagesPath } from '../database/db-path'

describe('storeProductImage', () => {
  let sourceFile: string

  beforeEach(() => {
    sourceFile = path.join(os.tmpdir(), `pos-source-image-${Date.now()}.png`)
    fs.writeFileSync(sourceFile, 'fake-png-bytes')
  })

  afterEach(() => {
    if (fs.existsSync(sourceFile)) fs.rmSync(sourceFile)
    const imagesDir = getProductImagesPath()
    if (fs.existsSync(imagesDir)) fs.rmSync(imagesDir, { recursive: true, force: true })
  })

  it('copies the source file into the product-images folder under a new filename', () => {
    const filename = storeProductImage(sourceFile)
    expect(filename).toMatch(/\.png$/)
    const storedPath = path.join(getProductImagesPath(), filename)
    expect(fs.existsSync(storedPath)).toBe(true)
    expect(fs.readFileSync(storedPath, 'utf8')).toBe('fake-png-bytes')
  })

  it('does not modify or remove the original source file', () => {
    storeProductImage(sourceFile)
    expect(fs.existsSync(sourceFile)).toBe(true)
    expect(fs.readFileSync(sourceFile, 'utf8')).toBe('fake-png-bytes')
  })

  it('generates a different filename for each call, even for the same source', () => {
    const first = storeProductImage(sourceFile)
    const second = storeProductImage(sourceFile)
    expect(first).not.toBe(second)
  })

  it('rejects an unsupported file extension', () => {
    const badFile = path.join(os.tmpdir(), `pos-source-image-${Date.now()}.exe`)
    fs.writeFileSync(badFile, 'not an image')
    expect(() => storeProductImage(badFile)).toThrow(UnsupportedImageTypeError)
    fs.rmSync(badFile)
  })
})

describe('deleteProductImage', () => {
  afterEach(() => {
    const imagesDir = getProductImagesPath()
    if (fs.existsSync(imagesDir)) fs.rmSync(imagesDir, { recursive: true, force: true })
  })

  it('deletes a previously-stored image', () => {
    const sourceFile = path.join(os.tmpdir(), `pos-source-image-${Date.now()}.png`)
    fs.writeFileSync(sourceFile, 'fake-png-bytes')
    const filename = storeProductImage(sourceFile)
    fs.rmSync(sourceFile)

    deleteProductImage(filename)

    expect(fs.existsSync(path.join(getProductImagesPath(), filename))).toBe(false)
  })

  it('does not throw when the filename does not exist', () => {
    expect(() => deleteProductImage('does-not-exist.png')).not.toThrow()
  })
})
