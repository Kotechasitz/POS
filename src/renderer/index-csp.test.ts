import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Product images are served through the custom app-image:// protocol
// (src/main/index.ts) and rendered via <img src="app-image://...">
// (ProductList.tsx, ProductGrid.tsx, ProductForm.tsx). The page's CSP must
// allow that scheme in img-src, or the browser silently drops the request
// and the image never appears.
describe('renderer CSP', () => {
  it('allows the app-image: scheme in img-src', () => {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8')
    const match = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)
    expect(match).not.toBeNull()
    const imgSrcMatch = match![1].match(/img-src ([^;]+)/)
    expect(imgSrcMatch).not.toBeNull()
    expect(imgSrcMatch![1]).toContain('app-image:')
  })
})
