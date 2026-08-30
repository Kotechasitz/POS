# POS MVP — Phase 1: Project Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the POS MVP desktop project (Electron + React + TypeScript + SQLite + Drizzle) with the MVP data schema in place, migrations that run automatically, and a dev build that visibly proves the local database is created and reachable only through the main process.

**Architecture:** Electron app scaffolded with `electron-vite` (main / preload / renderer split). All SQLite/Drizzle access lives under `src/main/database/` and `src/main/domain/` in the **main process only** — the renderer never touches the database file directly, it calls an IPC method that the preload script exposes. This satisfies spec §13 ("ห้าม expose SQLite file ให้ UI เขียนตรง ๆ; ผ่าน application/repository boundary") from the very first commit, so no later phase has to retrofit the boundary.

**Tech Stack:** Electron, Vite (`electron-vite`), React 18, TypeScript, better-sqlite3, Drizzle ORM + drizzle-kit, Vitest, tsx.

This plan implements **Development Roadmap Phase 1 only** (spec §15: "Project setup, Electron, React, SQLite, Drizzle" — exit criteria "เปิดแอป Windows dev และสร้าง DB ได้"). Phases 2–6 (Products CRUD, POS cart/barcode flow, atomic Complete-Sale + Stock, Dashboard, Windows packaging) are separate follow-up plans to be written after this one lands, per the spec's own phase breakdown.

## Global Constraints

These come from `POS_MVP_Product_Technical_Specification.docx` and apply to every task below:

- Primary platform: Windows PC (spec: Document status / Primary platform).
- local-first: the app must not depend on the Internet for a sale transaction; the transactional data lives in local SQLite (spec §1).
- **Never let the renderer/UI touch the SQLite file directly** — all access goes through the main-process repository/IPC boundary (spec §13).
- Money is never stored or computed as floating point — persist as an integer number of satang (`*_cents` columns) (spec §6.2, §11.1).
- `products.barcode` must be UNIQUE (spec §6.1, §8.1).
- `stock` is an integer in the MVP (spec §6.1).
- Suggested tech stack: React + TypeScript + Vite + Electron + SQLite + Drizzle ORM (spec §9) — do not introduce a backend, microservices, Redis, or cloud sync at this stage (spec §16, §18 "Over-engineering").
- SQL schema for `products`, `sales`, `sale_items`, `stock_transactions` is specified verbatim in spec §8.2 — this plan's schema must match it field-for-field (column names/types), only translated into Drizzle's `sqlite-core` table builder.

---

## File Structure

```
MyProject/
├── drizzle/                          # generated SQL migrations (drizzle-kit output)
├── drizzle.config.ts                 # drizzle-kit config, points at schema + output folder
├── scripts/
│   └── seed.ts                       # dev-only seed data (Definition of Done: "seed data สำหรับ demo")
├── src/
│   ├── main/
│   │   ├── index.ts                  # Electron main entry (from scaffold, modified in Task 4)
│   │   ├── database/
│   │   │   ├── schema.ts             # Drizzle schema — the 4 MVP tables
│   │   │   ├── schema.test.ts
│   │   │   ├── client.ts             # createDbClient(): opens file, runs migrations
│   │   │   ├── client.test.ts
│   │   │   └── db-path.ts            # resolves dev.db (dev) vs userData/pos.db (prod)
│   │   └── ipc/                      # created in Task 4
│   ├── preload/
│   │   ├── index.ts                  # exposes `api.dbHealth()` to the renderer (modified Task 4)
│   │   └── index.d.ts                # typings for the exposed API (modified Task 4)
│   └── renderer/
│       └── src/
│           └── App.tsx               # shows "Database ready — N products" (modified Task 4)
├── vitest.config.ts
├── package.json
└── tsconfig*.json                    # from scaffold, unmodified
```

Rationale for deviating from spec §9.2's flat `src/{features,domain,application,database,electron}` layout: that layout assumes a single process. Electron forces a hard process boundary (renderer cannot `require('better-sqlite3')` safely/at all in a context-isolated app), so `domain/` and `database/` are nested under `src/main/` where they are actually usable, and `src/preload` + `src/renderer` stay thin. Later phases will still have `src/main/domain/<subsystem>` and `src/main/database/repositories/` — the same conceptual folders the spec asks for, just rooted correctly for Electron.

---

### Task 1: Scaffold the Electron + React + TypeScript project

**Files:**
- Create: entire `MyProject/` scaffold via `electron-vite`'s starter (`src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/App.tsx`, `package.json`, `tsconfig*.json`, `electron.vite.config.ts`, etc.)
- Modify: `MyProject/package.json` (add scripts)
- Create: `MyProject/.gitignore`

**Interfaces:**
- Produces: a working `npm run build` and a git repository other tasks commit into. No code interfaces yet.

- [ ] **Step 1: Scaffold the project**

Run from the workspace root (`D:\Work\Sandbox`), non-interactively (the `--template` flag skips the prompt):

```bash
npm create @quick-start/electron@latest MyProject -- --template react-ts
```

`MyProject` already exists as an empty folder — the scaffolder will populate it in place.

- [ ] **Step 2: Install the project's own dependencies**

```bash
cd MyProject
npm install
```

- [ ] **Step 3: Verify the scaffold builds before touching anything**

```bash
npm run build
```

Expected: exits 0, producing an `out/` folder. If this fails, stop and fix the scaffold before proceeding — every later task assumes a working base.

- [ ] **Step 4: Add the dependencies Phase 1 needs**

```bash
npm install drizzle-orm better-sqlite3
npm install -D drizzle-kit @electron/rebuild vitest tsx
```

- [ ] **Step 5: Add the npm scripts this plan's later tasks rely on**

Edit `package.json`'s `"scripts"` block, adding these entries (keep whatever `dev`/`build`/`start` the scaffold already generated for the others, but replace `dev` as shown — `better-sqlite3` must be rebuilt for Electron's Node ABI before Electron can load it, see the note below):

```json
{
  "scripts": {
    "dev": "npm run rebuild:electron && electron-vite dev",
    "rebuild:electron": "electron-rebuild -f -w better-sqlite3",
    "test": "vitest run",
    "test:watch": "vitest",
    "seed": "tsx scripts/seed.ts",
    "db:generate": "drizzle-kit generate"
  }
}
```

> **Native module note:** `better-sqlite3` ships a prebuilt binary matched to plain Node's ABI, which is what `npm test` (Vitest, running under plain Node) needs. `npm run dev` runs the module inside *Electron's* embedded Node, which typically has a different ABI, so it must be rebuilt with `electron-rebuild` first — hence `rebuild:electron` runs automatically before `electron-vite dev`. Consequence: if you run `npm run dev` and then immediately `npm test`, the test run can fail with a `NODE_MODULE_VERSION mismatch`. Fix by running `npm rebuild better-sqlite3` to restore the plain-Node build before testing again. This is a known tradeoff of using a native SQLite driver in Electron, not a bug in this plan.

- [ ] **Step 6: Add `.gitignore` entries and initialize git**

Add to `MyProject/.gitignore` (create the file if the scaffold didn't):

```
node_modules/
out/
dist/
dev.db
dev.db-journal
dev.db-wal
dev.db-shm
```

```bash
cd MyProject
git init
git add -A
git commit -m "chore: scaffold Electron + React + TypeScript project"
```

- [ ] **Step 7: Commit is the checkpoint for this task — no separate commit step needed (already done in Step 6).**

---

### Task 2: MVP database schema and migrations (Drizzle)

**Files:**
- Create: `src/main/database/schema.ts`
- Create: `src/main/database/schema.test.ts`
- Create: `drizzle.config.ts`
- Create: `drizzle/` (generated by drizzle-kit, committed to git)

**Interfaces:**
- Consumes: nothing from Task 1 except the installed `drizzle-orm`/`drizzle-kit`/`better-sqlite3` packages and the `db:generate` npm script.
- Produces: exported Drizzle tables `products`, `sales`, `saleItems`, `stockTransactions` from `src/main/database/schema.ts`, and a `./drizzle` migrations folder — both consumed by Task 3's `createDbClient`.

- [ ] **Step 1: Write the failing test**

Create `src/main/database/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { products } from './schema';

describe('database schema', () => {
  it('creates all four MVP tables', () => {
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: './drizzle' });

    const tables = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'"
      )
      .all()
      .map((row) => (row as { name: string }).name)
      .sort();

    expect(tables).toEqual(['products', 'sale_items', 'sales', 'stock_transactions']);
    sqlite.close();
  });

  it('rejects a duplicate barcode', () => {
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: './drizzle' });

    const now = new Date().toISOString();
    db.insert(products)
      .values({
        id: 'p1',
        barcode: '8850001',
        name: 'Water',
        priceCents: 1000,
        stock: 10,
        isActive: true,
        createdAt: now,
        updatedAt: now
      })
      .run();

    expect(() =>
      db
        .insert(products)
        .values({
          id: 'p2',
          barcode: '8850001',
          name: 'Water 2',
          priceCents: 1200,
          stock: 5,
          isActive: true,
          createdAt: now,
          updatedAt: now
        })
        .run()
    ).toThrow(/UNIQUE constraint failed/);

    sqlite.close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `src/main/database/schema.ts` does not exist yet (module not found), or the `./drizzle` folder doesn't exist yet.

- [ ] **Step 3: Write the schema**

Create `src/main/database/schema.ts` (field-for-field match of spec §8.2's SQL):

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  barcode: text('barcode').notNull().unique(),
  name: text('name').notNull(),
  priceCents: integer('price_cents').notNull(),
  stock: integer('stock').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const sales = sqliteTable('sales', {
  id: text('id').primaryKey(),
  totalCents: integer('total_cents').notNull(),
  status: text('status').notNull().default('COMPLETED'),
  createdAt: text('created_at').notNull()
});

export const saleItems = sqliteTable('sale_items', {
  id: text('id').primaryKey(),
  saleId: text('sale_id')
    .notNull()
    .references(() => sales.id),
  productId: text('product_id')
    .notNull()
    .references(() => products.id),
  productName: text('product_name').notNull(),
  priceCents: integer('price_cents').notNull(),
  quantity: integer('quantity').notNull(),
  totalCents: integer('total_cents').notNull()
});

export const stockTransactions = sqliteTable('stock_transactions', {
  id: text('id').primaryKey(),
  productId: text('product_id')
    .notNull()
    .references(() => products.id),
  type: text('type').notNull(),
  quantity: integer('quantity').notNull(),
  referenceId: text('reference_id'),
  createdAt: text('created_at').notNull()
});
```

- [ ] **Step 4: Write the drizzle-kit config**

Create `drizzle.config.ts` at the project root:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/main/database/schema.ts',
  out: './drizzle',
  dialect: 'sqlite'
});
```

- [ ] **Step 5: Generate the migration**

```bash
npm run db:generate
```

Expected: creates `drizzle/0000_<name>.sql` and `drizzle/meta/`.

- [ ] **Step 6: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS (both `schema.test.ts` cases).

- [ ] **Step 7: Commit**

```bash
git add drizzle.config.ts drizzle/ src/main/database/schema.ts src/main/database/schema.test.ts
git commit -m "feat: add MVP database schema and migrations"
```

---

### Task 3: Database client (open file, run migrations)

**Files:**
- Create: `src/main/database/client.ts`
- Create: `src/main/database/client.test.ts`

**Interfaces:**
- Consumes: `products`, `sales`, `saleItems`, `stockTransactions` are not imported directly here, but the `./drizzle` migrations folder from Task 2 is.
- Produces: `createDbClient(dbFilePath: string, migrationsFolder: string): { db: BetterSQLite3Database; sqlite: Database.Database }` — this exact signature is what Task 4's main-process wiring calls.

- [ ] **Step 1: Write the failing test**

Create `src/main/database/client.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDbClient } from './client';

describe('createDbClient', () => {
  let dbFile: string;

  afterEach(() => {
    if (dbFile && fs.existsSync(dbFile)) fs.rmSync(dbFile);
  });

  it('creates a SQLite file on disk with migrations applied', () => {
    dbFile = path.join(os.tmpdir(), `pos-test-${Date.now()}.db`);
    const { sqlite } = createDbClient(dbFile, path.resolve(__dirname, '../../../drizzle'));

    expect(fs.existsSync(dbFile)).toBe(true);
    const row = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='products'")
      .get();
    expect(row).toBeDefined();
    sqlite.close();
  });

  it('enables foreign key enforcement', () => {
    dbFile = path.join(os.tmpdir(), `pos-test-fk-${Date.now()}.db`);
    const { sqlite } = createDbClient(dbFile, path.resolve(__dirname, '../../../drizzle'));

    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    sqlite.close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `./client` module not found.

- [ ] **Step 3: Write the implementation**

Create `src/main/database/client.ts`:

```ts
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

export interface DbClient {
  db: BetterSQLite3Database;
  sqlite: Database.Database;
}

export function createDbClient(dbFilePath: string, migrationsFolder: string): DbClient {
  const sqlite = new Database(dbFilePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder });
  return { db, sqlite };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS (both `client.test.ts` cases, and `schema.test.ts` still passing).

- [ ] **Step 5: Commit**

```bash
git add src/main/database/client.ts src/main/database/client.test.ts
git commit -m "feat: add SQLite client that opens the db file and runs migrations"
```

---

### Task 4: Wire the database into Electron's main process, expose it over IPC, seed dev data

**Files:**
- Create: `src/main/database/db-path.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/renderer/src/App.tsx`
- Create: `scripts/seed.ts`

**Interfaces:**
- Consumes: `createDbClient` from Task 3, `products` table from Task 2.
- Produces: an IPC channel `db:health` returning `{ productCount: number }`, exposed to the renderer as `window.api.dbHealth(): Promise<{ productCount: number }>`.

This task is integration wiring, not new business logic, so it is verified by a manual dev-mode smoke check (Step 6) rather than a Vitest unit test — there is no pure function here to unit-test; the thing being proven is "the whole Electron app boots and shows live DB data," which only exists once assembled.

- [ ] **Step 1: Resolve the db file path for dev vs. production**

Create `src/main/database/db-path.ts`:

```ts
import { app } from 'electron';
import path from 'node:path';

export function getDbPath(): string {
  if (process.env.NODE_ENV === 'development') {
    return path.resolve(process.cwd(), 'dev.db');
  }
  return path.join(app.getPath('userData'), 'pos.db');
}
```

- [ ] **Step 2: Wire the client and an IPC handler into the main process**

Open `src/main/index.ts` (generated by the `electron-vite` react-ts scaffold). It contains an `app.whenReady().then(() => { ... createWindow() })` block and imports from `electron` / `@electron-toolkit/utils`. Add:

At the top, alongside the existing imports:

```ts
import { ipcMain } from 'electron'
import { createDbClient } from './database/client'
import { getDbPath } from './database/db-path'
import { products } from './database/schema'
```

(`ipcMain` may already be imported from `electron` — merge into the existing `import { app, BrowserWindow, ipcMain } from 'electron'` line instead of duplicating it.)

Inside the `app.whenReady().then(() => { ... })` block, before `createWindow()` is called, add:

```ts
const { db } = createDbClient(getDbPath(), join(__dirname, '../../drizzle'))

ipcMain.handle('db:health', () => {
  const rows = db.select().from(products).all()
  return { productCount: rows.length }
})
```

`join` should already be imported from `node:path` in the scaffold's `index.ts`; if not, add `import { join } from 'node:path'`. The relative path `../../drizzle` is `out/main` (the built main process's location under `out/`) walked back up to the project root's `drizzle/` folder — verify this resolves correctly in Step 6; if `electron-vite`'s output layout differs, adjust the relative segment count so it points at the project-root `drizzle/` folder either way.

- [ ] **Step 3: Expose the IPC call from the preload script**

Open `src/preload/index.ts`. It defines a custom `api` object and calls `contextBridge.exposeInMainWorld('api', api)`. Add a method to that `api` object:

```ts
const api = {
  dbHealth: (): Promise<{ productCount: number }> => ipcRenderer.invoke('db:health')
}
```

(If the scaffold's `api` object already has other members, add `dbHealth` alongside them rather than replacing the object.)

Open `src/preload/index.d.ts` and add the matching type to the `Window` interface's `api`:

```ts
interface Window {
  electron: ElectronAPI
  api: {
    dbHealth: () => Promise<{ productCount: number }>
  }
}
```

(Merge into the existing `api` type rather than duplicating the `interface Window` block.)

- [ ] **Step 4: Show DB health in the renderer**

Open `src/renderer/src/App.tsx`. Add a `useState`/`useEffect` that calls `window.api.dbHealth()` on mount and renders the result:

```tsx
import { useEffect, useState } from 'react'

function App(): JSX.Element {
  const [dbStatus, setDbStatus] = useState<string>('Checking database...')

  useEffect(() => {
    window.api.dbHealth().then(({ productCount }) => {
      setDbStatus(`Database ready — ${productCount} products`)
    })
  }, [])

  return (
    <div>
      <p data-testid="db-status">{dbStatus}</p>
    </div>
  )
}

export default App
```

Keep whatever else the scaffold's `App.tsx` already renders — this replaces only the component body, adding the status line above/alongside the existing content rather than deleting it.

- [ ] **Step 5: Add the dev seed script**

Create `scripts/seed.ts`:

```ts
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createDbClient } from '../src/main/database/client'
import { products } from '../src/main/database/schema'

const dbFile = path.resolve(process.cwd(), 'dev.db')
const migrationsFolder = path.resolve(process.cwd(), 'drizzle')
const { db, sqlite } = createDbClient(dbFile, migrationsFolder)

const now = new Date().toISOString()
const seedProducts = [
  { barcode: '8850001000012', name: 'Coca Cola', priceCents: 2000 },
  { barcode: '8850002000013', name: 'Water', priceCents: 1000 },
  { barcode: '8850003000014', name: 'Chips', priceCents: 3500 }
]

for (const p of seedProducts) {
  db.insert(products)
    .values({
      id: randomUUID(),
      barcode: p.barcode,
      name: p.name,
      priceCents: p.priceCents,
      stock: 50,
      isActive: true,
      createdAt: now,
      updatedAt: now
    })
    .onConflictDoNothing()
    .run()
}

console.log(`Seeded ${seedProducts.length} products into ${dbFile}`)
sqlite.close()
```

- [ ] **Step 6: Manually verify the dev app launches and shows real DB data (Phase 1 exit criteria)**

```bash
npm run seed
npm run dev
```

Expected:
- `dev.db` appears in the project root after `npm run seed`.
- The Electron window opens (Windows dev launch) and shows `Database ready — 3 products` — proving the DB was created, migrated, seeded, and read back entirely through the main process → IPC → renderer path, with the renderer never touching `dev.db` directly.

If `npm run dev` throws a `NODE_MODULE_VERSION` mismatch, `rebuild:electron` (wired in Task 1 Step 5) did not run — check the `dev` script wiring.

- [ ] **Step 7: Commit**

```bash
git add src/main/database/db-path.ts src/main/index.ts src/preload/index.ts src/preload/index.d.ts src/renderer/src/App.tsx scripts/seed.ts package.json
git commit -m "feat: wire database into main process, expose db:health over IPC, add dev seed script"
```

---

## Definition of Done for this plan

- [ ] `npm run build` succeeds (Task 1).
- [ ] `npm test` passes all Vitest suites (Tasks 2–3).
- [ ] `npm run seed && npm run dev` opens the Electron app on Windows and displays live product data read from `dev.db` through the IPC boundary (Task 4) — satisfying spec §17's "ติดตั้งบน Windows PC ได้" / "มี seed data สำหรับ demo" and roadmap Phase 1's exit criteria "เปิดแอป Windows dev และสร้าง DB ได้".
- [ ] The renderer process has zero imports of `better-sqlite3` or `drizzle-orm` anywhere under `src/renderer/` (spec §13 boundary).

## What Phase 1 deliberately does not cover (deferred to later plans)

- Products CRUD UI and repository layer (roadmap Phase 2).
- Cart, barcode scan handling, `Money` value object, pricing (roadmap Phase 3 — spec §6.2/§11.1).
- Atomic Complete-Sale transaction + stock decrement + `stock_transactions` ledger writes (roadmap Phase 4 — spec §6.3/§11).
- Dashboard/reporting queries (roadmap Phase 5 — spec §12).
- Windows installer packaging (roadmap Phase 6).
