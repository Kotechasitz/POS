import { describe, it, expect, vi, afterEach } from 'vitest'
import path from 'node:path'

const isMock = vi.hoisted(() => ({ dev: true }))
vi.mock('@electron-toolkit/utils', () => ({ is: isMock }))
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => 'C:\\fake\\userData') }
}))

import { getDbPath, getMigrationsPath } from './db-path'

describe('getDbPath', () => {
  afterEach(() => {
    isMock.dev = true
  })

  it('resolves to dev.db in the working directory in dev mode', () => {
    isMock.dev = true
    expect(getDbPath()).toBe(path.resolve(process.cwd(), 'dev.db'))
  })

  it("resolves under Electron's userData directory in production", () => {
    isMock.dev = false
    expect(getDbPath()).toBe(path.join('C:\\fake\\userData', 'pos.db'))
  })
})

describe('getMigrationsPath', () => {
  afterEach(() => {
    isMock.dev = true
  })

  it('resolves to the project-root drizzle folder in dev mode', () => {
    isMock.dev = true
    expect(getMigrationsPath()).toBe(path.join(__dirname, '../../drizzle'))
  })

  it('resolves under process.resourcesPath in production', () => {
    isMock.dev = false
    Object.defineProperty(process, 'resourcesPath', {
      value: 'C:\\fake\\resources',
      configurable: true
    })
    expect(getMigrationsPath()).toBe(path.join('C:\\fake\\resources', 'drizzle'))
  })
})
