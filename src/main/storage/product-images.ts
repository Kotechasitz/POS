import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { getProductImagesPath } from '../database/db-path'

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

export class UnsupportedImageTypeError extends Error {
  constructor(extension: string) {
    super(
      `Unsupported image type "${extension}". Allowed: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`
    )
    this.name = 'UnsupportedImageTypeError'
  }
}

// Copies a source image file (picked by the user from anywhere on disk) into
// this app's own product-images storage folder under a fresh UUID filename,
// so a product record never depends on the original file staying where it
// was. Returns the stored filename only (not an absolute path) — that's
// what gets persisted on the product record, matching getDbPath's/
// getMigrationsPath's existing filename-not-absolute-path convention.
export function storeProductImage(sourcePath: string): string {
  const extension = path.extname(sourcePath).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new UnsupportedImageTypeError(extension)
  }

  const imagesDir = getProductImagesPath()
  fs.mkdirSync(imagesDir, { recursive: true })

  const filename = `${randomUUID()}${extension}`
  fs.copyFileSync(sourcePath, path.join(imagesDir, filename))

  return filename
}

// Deletes a previously-stored product image by its stored filename. Not an
// error if the file is already gone — the goal is "make sure it's gone,"
// not "prove it was there."
export function deleteProductImage(filename: string): void {
  const filePath = path.join(getProductImagesPath(), filename)
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath)
  }
}
