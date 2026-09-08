import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener)
    }
  }
}))

import { registerCategoryHandlers } from './register-category-handlers'
import { createDbClient, type DbClient } from '../database/client'

describe('registerCategoryHandlers', () => {
  let dbFile: string
  let client: DbClient

  beforeEach(() => {
    handlers.clear()
    dbFile = path.join(os.tmpdir(), `pos-ipc-categories-${Date.now()}-${Math.random()}.db`)
    client = createDbClient(dbFile, path.resolve(__dirname, '../../../drizzle'))
    registerCategoryHandlers(client.db)
  })

  afterEach(() => {
    client.sqlite.close()
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile)
  })

  it('registers all four category channels', () => {
    expect(handlers.has('categories:list')).toBe(true)
    expect(handlers.has('categories:create')).toBe(true)
    expect(handlers.has('categories:update')).toBe(true)
    expect(handlers.has('categories:delete')).toBe(true)
  })

  it('categories:create creates a category and categories:list returns it', () => {
    const createHandler = handlers.get('categories:create')!
    const listHandler = handlers.get('categories:list')!

    const created = createHandler({}, 'Beverages') as { name: string }
    expect(created.name).toBe('Beverages')

    expect(listHandler({})).toHaveLength(1)
  })

  it('categories:update renames a category', () => {
    const createHandler = handlers.get('categories:create')!
    const updateHandler = handlers.get('categories:update')!

    const created = createHandler({}, 'Beverages') as { id: string }
    const updated = updateHandler({}, created.id, 'Drinks') as { name: string }

    expect(updated.name).toBe('Drinks')
  })

  it('categories:delete removes a category', () => {
    const createHandler = handlers.get('categories:create')!
    const deleteHandler = handlers.get('categories:delete')!
    const listHandler = handlers.get('categories:list')!

    const created = createHandler({}, 'Beverages') as { id: string }
    deleteHandler({}, created.id)

    expect(listHandler({})).toHaveLength(0)
  })
})
