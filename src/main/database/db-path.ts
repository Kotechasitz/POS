import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import path from 'node:path'

export function getDbPath(): string {
  if (is.dev) {
    return path.resolve(process.cwd(), 'dev.db')
  }
  return path.join(app.getPath('userData'), 'pos.db')
}
