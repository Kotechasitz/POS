/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type -- CommonJS script, run directly via ELECTRON_RUN_AS_NODE with no build step; no TypeScript here to annotate */

// scripts/smoke-test-package.cjs
//
// Verifies a packaged Windows build's native SQLite binding and bundled
// Drizzle migrations both work under Electron's actual runtime — not
// plain Node. Run via the packaged executable itself with
// ELECTRON_RUN_AS_NODE=1 (see the `smoke:package` npm script), which
// makes Electron behave as a Node.js interpreter with no GUI window, so
// this is fully scriptable / CI-safe with no display required.
//
// Usage: ELECTRON_RUN_AS_NODE=1 <path-to-packaged-exe> scripts/smoke-test-package.cjs <win-unpacked-dir>

const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const unpackedDirArg = process.argv[2]
if (!unpackedDirArg) {
  console.error('Usage: smoke-test-package.cjs <path-to-win-unpacked-dir>')
  process.exit(1)
}
// Resolve to an absolute path: require() treats a relative path without a
// leading './' as a bare module specifier (node_modules lookup) rather than
// a file path, which fails even though the path is valid relative to cwd.
const unpackedDir = path.resolve(unpackedDirArg)

const nativeModulePath = path.join(
  unpackedDir,
  'resources',
  'app.asar.unpacked',
  'node_modules',
  'better-sqlite3'
)
const migrationsPath = path.join(unpackedDir, 'resources', 'drizzle')

if (!fs.existsSync(nativeModulePath)) {
  console.error(`FAIL: better-sqlite3 not found unpacked at ${nativeModulePath}`)
  process.exit(1)
}
if (!fs.existsSync(migrationsPath)) {
  console.error(`FAIL: drizzle migrations folder not found at ${migrationsPath}`)
  process.exit(1)
}

// Derive the expected post-migration table list from the packaged
// migrations' own snapshot metadata, rather than hardcoding it — this
// stays correct automatically if the schema ever changes, and it's
// reading the exact metadata file the packaged migrator itself consumes.
const journalPath = path.join(migrationsPath, 'meta', '_journal.json')
if (!fs.existsSync(journalPath)) {
  console.error(`FAIL: migration journal not found at ${journalPath}`)
  process.exit(1)
}
const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'))
const latestEntry = journal.entries[journal.entries.length - 1]
const snapshotPath = path.join(
  migrationsPath,
  'meta',
  `${String(latestEntry.idx).padStart(4, '0')}_snapshot.json`
)
if (!fs.existsSync(snapshotPath)) {
  console.error(`FAIL: migration snapshot not found at ${snapshotPath}`)
  process.exit(1)
}
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
const expected = Object.keys(snapshot.tables).sort()

const Database = require(nativeModulePath)

// A real file-backed temp DB, not ':memory:' — SQLite silently ignores WAL
// journal mode for in-memory/temporary databases, which would make the
// 'journal_mode = WAL' pragma below a no-op and defeat the point of
// exercising the same on-disk configuration production actually uses.
const tmpDbPath = path.join(os.tmpdir(), `pos-smoke-test-${Date.now()}-${process.pid}.db`)

function cleanupTempDb() {
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${tmpDbPath}${suffix}`
    if (fs.existsSync(file)) {
      fs.rmSync(file)
    }
  }
}

const sqlite = new Database(tmpDbPath)
// Same pragmas createDbClient (src/main/database/client.ts) sets in
// production — this script intentionally doesn't call createDbClient
// itself (it's TypeScript, and this is a plain, build-free CommonJS
// script), but it must replicate the same configuration to actually prove
// the packaged build behaves like the real app, not a lighter stand-in.
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

// drizzle-orm itself is pure JS, so requiring it from the dev tree (this
// script's own node_modules) is fine — only the native binding and the
// migrations folder need to be the real packaged artifacts.
const { drizzle } = require('drizzle-orm/better-sqlite3')
const { migrate } = require('drizzle-orm/better-sqlite3/migrator')
const db = drizzle(sqlite)

try {
  migrate(db, { migrationsFolder: migrationsPath })
} catch (err) {
  sqlite.close()
  cleanupTempDb()
  console.error(`FAIL: migration failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}

// Drizzle's own migration-tracking table is named exactly '__drizzle_migrations'
// — excluded by exact match, not a LIKE pattern (a LIKE '__drizzle%' pattern
// leaves '_' as an unescaped single-character wildcard, so it doesn't mean
// what it looks like it means).
const tables = sqlite
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'"
  )
  .all()
  .map((row) => row.name)
  .sort()

sqlite.close()
cleanupTempDb()

const missing = expected.filter((name) => !tables.includes(name))
if (missing.length > 0) {
  console.error(`FAIL: missing tables after migration: ${missing.join(', ')}`)
  console.error(`Expected: ${expected.join(', ')}`)
  console.error(`Found: ${tables.join(', ') || '(none)'}`)
  process.exit(1)
}

console.log(`OK: packaged native module + migrations verified. Tables: ${tables.join(', ')}`)
process.exit(0)
