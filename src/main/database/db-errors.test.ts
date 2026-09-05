import { describe, it, expect } from 'vitest'
import { isUniqueConstraintError } from './db-errors'

describe('isUniqueConstraintError', () => {
  it('returns true for a better-sqlite3 unique constraint violation', () => {
    const err = new Error('UNIQUE constraint failed: products.barcode')
    expect(isUniqueConstraintError(err)).toBe(true)
  })

  it('returns false for an unrelated Error', () => {
    expect(isUniqueConstraintError(new Error('disk I/O error'))).toBe(false)
  })

  it('returns false for a non-Error value', () => {
    expect(isUniqueConstraintError('UNIQUE constraint failed')).toBe(false)
  })
})
