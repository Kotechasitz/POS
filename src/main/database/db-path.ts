import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import path from 'node:path'

export function getDbPath(): string {
  if (is.dev) {
    return path.resolve(process.cwd(), 'dev.db')
  }
  return path.join(app.getPath('userData'), 'pos.db')
}

// The Drizzle migrations folder isn't application code — electron-vite's
// bundler doesn't touch it, and it must be located relative to wherever the
// packaged app actually put it, not relative to source layout. In dev,
// __dirname (once bundled into out/main/index.js by electron-vite) sits two
// levels below the project root, so '../../drizzle' reaches the real
// migrations folder the same way main/index.ts always has. In a packaged
// build, electron-builder.yml's `extraResources` copies drizzle/ next to
// the app (not inside app.asar), and Electron's process.resourcesPath is
// the documented, cross-platform way to find that directory at runtime.
export function getMigrationsPath(): string {
  if (is.dev) {
    return path.join(__dirname, '../../drizzle')
  }
  return path.join(process.resourcesPath, 'drizzle')
}

// Same dev/production split as getDbPath/getMigrationsPath: in dev, a
// project-local folder that's easy to find and safe to gitignore; in
// production, Electron's userData directory, which is guaranteed writable
// and unique per install.
export function getProductImagesPath(): string {
  if (is.dev) {
    return path.resolve(process.cwd(), 'dev-product-images')
  }
  return path.join(app.getPath('userData'), 'product-images')
}
