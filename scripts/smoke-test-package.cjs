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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Database = require(nativeModulePath)
const sqlite = new Database(':memory:')
sqlite.pragma('journal_mode = WAL')

// drizzle-orm itself is pure JS, so requiring it from the dev tree (this
// script's own node_modules) is fine — only the native binding and the
// migrations folder need to be the real packaged artifacts.
const { drizzle } = require('drizzle-orm/better-sqlite3')
const { migrate } = require('drizzle-orm/better-sqlite3/migrator')
const db = drizzle(sqlite)
migrate(db, { migrationsFolder: migrationsPath })

const tables = sqlite
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'"
  )
  .all()
  .map((row) => row.name)
  .sort()

const expected = ['products', 'sale_items', 'sales', 'stock_transactions']
const missing = expected.filter((name) => !tables.includes(name))
if (missing.length > 0) {
  console.error(`FAIL: missing tables after migration: ${missing.join(', ')}`)
  console.error(`Found: ${tables.join(', ') || '(none)'}`)
  process.exit(1)
}

console.log(`OK: packaged native module + migrations verified. Tables: ${tables.join(', ')}`)
process.exit(0)
