// SQLite/better-sqlite3 unique-constraint violations surface as a generic
// Error whose message contains this exact substring — there's no distinct
// error class or code to check instead. Shared by every repository that
// needs to turn that generic error into a specific, named "duplicate X"
// error (e.g. DuplicateBarcodeError, DuplicateCategoryNameError).
export function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('UNIQUE constraint failed')
}
