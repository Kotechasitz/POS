# Phase 6: Windows Packaging + Smoke Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a working Windows installer for the app, fix the packaging bugs that only surface once the app is actually packaged (not merely run in dev), and hand off a written checklist for the parts of spec §17's Definition of Done that can only be verified on a real Windows machine with real hardware.

**Architecture:** This phase is release engineering, not new application features — no new screens, no new IPC. It touches `electron-builder.yml`, `package.json` metadata, one small addition to `src/main/database/db-path.ts`, and adds one standalone verification script (`scripts/smoke-test-package.cjs`) plus one documentation deliverable. Tasks here are verified by building the real packaged artifact and inspecting/exercising it, not by `npm test` unit tests (except for the one small pure function this phase adds).

**Tech Stack:** electron-builder (already installed, `^26.15.3`), the existing Electron/Vite/Drizzle/better-sqlite3 stack unchanged.

## Investigation already done (context for every task below)

Before writing this plan, `npm run typecheck`, `electron-vite build`, and `electron-builder --win --dir` were run directly against the current `master` to see what actually happens, rather than guessing. Findings, load-bearing for the tasks below:

1. **Confirmed real bug: the `drizzle/` migrations folder is not bundled at all.** `npx asar list dist/win-unpacked/resources/app.asar` shows zero `drizzle/*` entries. `main/index.ts` calls `createDbClient(getDbPath(), join(__dirname, '../../drizzle'))` — in dev, `__dirname` is `out/main/`, and `../../drizzle` correctly reaches the project-root `drizzle/` folder; in a packaged build, `__dirname` is inside `app.asar`, and `../../drizzle` resolves to a path that was never packaged, so `migrate()` would throw on first launch of the installed app. This is Task 1.

2. **Confirmed non-issue: native module ABI.** `better-sqlite3` (`^13.0.3`) is compiled against N-API (`NAPI_VERSION=10` in its `binding.gyp`), which is ABI-stable across Node/Electron versions — so despite `electron-builder.yml`'s `npmRebuild: false` and no explicit Electron-rebuild step in the `build`/`build:win` scripts, a smoke test (`ELECTRON_RUN_AS_NODE=1 dist/win-unpacked/myproject.exe <script requiring the packaged better-sqlite3>`) opened, wrote to, and read from a real SQLite DB successfully. electron-builder also already auto-unpacks the native `.node` binary from the asar (`resources/app.asar.unpacked/node_modules/better-sqlite3/...`) without any extra config needed. **No task in this plan needs to touch native-module rebuild configuration** — it already works, for this specific dependency, today.

3. **Product branding is still the electron-vite scaffold's placeholders** (`appId: com.electron.app`, `productName: myproject`, `package.json`'s `description`/`author`, `README.md`'s title) — cosmetic but visible to the end user in the installer, the Start Menu, and Windows' "Apps & Features" list. Task 2.

4. **The build already produces a real, working NSIS installer with no code-signing certificate configured** — `signtool.exe` runs but only to stamp the asar-integrity resource, not to apply an Authenticode signature (none is configured, and none is in scope — see spec §18 "Over-engineering: ห้ามเพิ่ม... ก่อนมี use case จริง"). This means Windows SmartScreen will warn on first run of the installer, which is normal and expected for an unsigned MVP installer; call this out in the Task 4 checklist rather than "fixing" it (a code-signing cert costs money and isn't a spec requirement).

## Global Constraints

- Every packaging change must be verified by actually building (`electron-vite build` + `electron-builder --win --dir` for iteration speed; the final Task 3 build uses the real `npm run build:win` target) and inspecting the output — not just "should work" reasoning. `dist/` and `out/` are already gitignored; never commit build output.
- Do not touch native-module rebuild configuration (`npmRebuild`, the `rebuild:electron`/`postinstall` scripts) — investigation already confirmed this isn't broken for this project's dependencies (see point 2 above). Adding unneeded rebuild machinery here would be exactly the kind of premature complexity spec §18 warns against.
- Do not add a code-signing step, an auto-update mechanism, or any other capability beyond what spec §17's Definition of Done actually lists. Remove the placeholder `publish:` block in `electron-builder.yml` (a fake `https://example.com/auto-updates` URL) rather than trying to make it real — there is no update server and none is in scope for MVP.
- Whoever writes a change writes its test in the same task, same standard as every prior phase: the one new pure function this phase adds (`getMigrationsPath`) gets a real unit test; the packaging behavior itself is verified by building and inspecting/executing the real artifact (that's this phase's equivalent of a test).
- **Never run the produced installer to actually install the app on this machine, and never attempt real code-signing.** Installing writes to Program Files, the registry, and the Start Menu — a system-level change outside what an agent should do unprompted. Every task's verification uses `electron-builder --win --dir` (produces a runnable `dist/win-unpacked/` folder with no install step) or the final unpacked build from `npm run build:win`, never the NSIS installer's actual install flow. Running the installer is the one thing this plan hands off to the human (Task 4's checklist).

## File Structure

- Modify: `src/main/database/db-path.ts` — add `getMigrationsPath()` alongside the existing `getDbPath()`.
- Create: `src/main/database/db-path.test.ts` — first-ever test coverage for this file (`getDbPath` had none; adding it now since this task is already touching the file).
- Modify: `src/main/index.ts` — use `getMigrationsPath()` instead of the current inline `join(__dirname, '../../drizzle')`.
- Modify: `electron-builder.yml` — `extraResources` for `drizzle/`, branding fields, remove the placeholder `publish:` block.
- Modify: `package.json` — `name`, `description`, `author`.
- Modify: `README.md` — title line.
- Create: `scripts/smoke-test-package.cjs` — standalone script that verifies a packaged build's native SQLite binding and bundled migrations, run via `ELECTRON_RUN_AS_NODE=1` against the packaged executable (not plain Node — the whole point is to exercise Electron's actual bundled runtime).
- Modify: `package.json` — add a `smoke:package` script wrapping the above.
- Create: `docs/smoke-test-checklist.md` — the manual, hardware-dependent verification checklist (spec §17 items this plan cannot verify itself).

---

### Task 1: Fix the missing `drizzle/` migrations bundling bug

**Files:**
- Modify: `src/main/database/db-path.ts`
- Create: `src/main/database/db-path.test.ts`
- Modify: `src/main/index.ts`
- Modify: `electron-builder.yml`

**Interfaces:**
- Consumes: `is` from `@electron-toolkit/utils` (already used by `getDbPath`); `path`/`process.resourcesPath` (Electron augments `NodeJS.Process` with `resourcesPath: string` in packaged builds — already available without extra typing work, matching how `app`/`BrowserWindow` etc. are already used elsewhere in this codebase without manual type declarations).
- Produces: `function getMigrationsPath(): string` from `db-path.ts`, for `main/index.ts` (this task) to consume, alongside the existing `getDbPath()`.

- [ ] **Step 1: Write the failing test for `getMigrationsPath`**

```typescript
// src/main/database/db-path.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import path from 'node:path'

const isMock = { dev: true }
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- db-path`
Expected: FAIL — `getMigrationsPath` is not exported yet (and `getDbPath` itself was never covered before, so confirm both `describe` blocks run and only the `getMigrationsPath` ones fail on the missing export).

- [ ] **Step 3: Implement `getMigrationsPath`**

```typescript
// src/main/database/db-path.ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- db-path`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Use `getMigrationsPath()` in `main/index.ts`**

In `src/main/index.ts`, change the import line:

```typescript
import { getDbPath } from './database/db-path'
```

to:

```typescript
import { getDbPath, getMigrationsPath } from './database/db-path'
```

And change:

```typescript
    dbClient = createDbClient(getDbPath(), join(__dirname, '../../drizzle'))
```

to:

```typescript
    dbClient = createDbClient(getDbPath(), getMigrationsPath())
```

(`join` from `'path'` is still used elsewhere in this file for the preload/renderer paths — do not remove that import.)

- [ ] **Step 6: Bundle `drizzle/` into the packaged app via `extraResources`**

In `electron-builder.yml`, add a top-level `extraResources` key (place it near `asarUnpack`, which is already there):

```yaml
extraResources:
  - from: drizzle
    to: drizzle
```

- [ ] **Step 7: Build and verify the migrations folder is actually packaged**

Run: `npx electron-vite build && npx electron-builder --win --dir`
Expected: build succeeds. Then run: `ls dist/win-unpacked/resources/drizzle` (or the Windows-shell equivalent) — expect to see the same `.sql` migration file(s) and `meta/` folder that exist in the project's own `drizzle/` directory. This directly proves the bug from the investigation section is fixed — do not skip this check, the test suite alone cannot catch this class of bug (it's specific to the packaged file layout).

- [ ] **Step 8: Run the full suite, typecheck, and lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS, no regressions.

- [ ] **Step 9: Commit**

```bash
git add src/main/database/db-path.ts src/main/database/db-path.test.ts src/main/index.ts electron-builder.yml
git commit -m "fix: bundle drizzle migrations into the packaged app via extraResources"
```

---

### Task 2: Product branding — replace the electron-vite scaffold's placeholder identity

**Files:**
- Modify: `electron-builder.yml`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this is metadata only, no code changes. Task 3 depends on the renamed executable (`POS.exe` instead of `myproject.exe`) to write its smoke-test invocation.

- [ ] **Step 1: Update `electron-builder.yml`'s identity fields**

Change:

```yaml
appId: com.electron.app
productName: myproject
```

to:

```yaml
appId: com.kotechasitz.pos
productName: POS
```

Change:

```yaml
win:
  executableName: myproject
```

to:

```yaml
win:
  executableName: POS
```

Remove the placeholder publish block entirely (there is no real update server, and none is in scope — see this plan's Global Constraints):

```yaml
publish:
  provider: generic
  url: https://example.com/auto-updates
```

- [ ] **Step 2: Update `package.json`'s identity fields**

Change:

```json
  "name": "myproject",
```
to:
```json
  "name": "pos",
```

Change:
```json
  "description": "An Electron application with React and TypeScript",
```
to:
```json
  "description": "Windows desktop POS for a single-store retail shop — barcode scanning, cart, sales, and a dashboard.",
```

Change:
```json
  "author": "example.com",
```
to:
```json
  "author": "kotechasitz",
```

- [ ] **Step 3: Update `README.md`'s title**

Change the first line from `# myproject` to `# POS`.

- [ ] **Step 4: Build and verify the new branding actually took effect**

Run: `npx electron-vite build && npx electron-builder --win --dir`
Expected: build succeeds, and `dist/win-unpacked/POS.exe` exists (the renamed executable — confirms `win.executableName` took effect). This is the concrete, checkable proof the rename worked; a build that still produces `myproject.exe` means something wasn't picked up.

- [ ] **Step 5: Run the full suite, typecheck, and lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS, no regressions (this task touches no application code, so this is a quick confirmation, not a deep check).

- [ ] **Step 6: Commit**

```bash
git add electron-builder.yml package.json README.md
git commit -m "chore: replace scaffold placeholder branding (appId, productName, description, author)"
```

---

### Task 3: Build the release installer and smoke-test the packaged artifact

**Files:**
- Create: `scripts/smoke-test-package.cjs`
- Modify: `package.json` (add `smoke:package` script)

**Interfaces:**
- Consumes: the packaged output of `npm run build:win` (specifically `dist/win-unpacked/`, produced by Tasks 1-2's fixes); `better-sqlite3` and `drizzle-orm` resolved from the project's own `node_modules` (pure-JS parts only — the native binding itself is loaded from the packaged path, not the dev tree, which is the entire point of this script).
- Produces: a `smoke:package` npm script other developers (and this plan's Task 4 checklist) can re-run after any future packaging change, without needing to remember the exact `ELECTRON_RUN_AS_NODE` invocation.

- [ ] **Step 1: Write the smoke-test script**

```javascript
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

const unpackedDir = process.argv[2]
if (!unpackedDir) {
  console.error('Usage: smoke-test-package.cjs <path-to-win-unpacked-dir>')
  process.exit(1)
}

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
```

- [ ] **Step 2: Add the `smoke:package` script**

In `package.json`'s `"scripts"` block, add (matching the existing `pretest` script's Windows-cmd env-var convention already used in this project):

```json
    "smoke:package": "set ELECTRON_RUN_AS_NODE=1&& dist\\win-unpacked\\POS.exe scripts\\smoke-test-package.cjs dist/win-unpacked",
```

- [ ] **Step 3: Build the real release artifact**

Run: `npm run build:win`
Expected: succeeds (this runs `typecheck` + `electron-vite build` + `electron-builder --win`, producing both `dist/win-unpacked/` and the actual NSIS installer `dist/POS-1.0.0-setup.exe` — do not run the installer, see Global Constraints).

- [ ] **Step 4: Run the smoke test against the real build**

Run: `npm run smoke:package`
Expected: prints `OK: packaged native module + migrations verified. Tables: products, sale_items, sales, stock_transactions` and exits 0. If it fails, the failure message names exactly which check failed (native module missing, migrations missing, or a specific missing table) — fix the root cause (most likely something Task 1 or 2 didn't fully apply) and re-run from Step 3, don't patch around the symptom in this script.

- [ ] **Step 5: Confirm the installer artifact exists and note its size**

Run: `ls -la dist/*.exe` (or the Windows-shell equivalent)
Expected: `POS-1.0.0-setup.exe` exists. Note its size in the task report — this is the artifact Task 4's checklist will reference by name.

- [ ] **Step 6: Commit**

```bash
git add scripts/smoke-test-package.cjs package.json
git commit -m "feat: add automated packaged-build smoke test (native module + migrations)"
```

(`dist/` itself is gitignored and stays out of version control — only the smoke-test script and the npm script wiring are committed.)

---

### Task 4: Write the manual smoke-test checklist for what needs a real machine

**Files:**
- Create: `docs/smoke-test-checklist.md`

**Interfaces:**
- Consumes: nothing — this is a standalone document.
- Produces: nothing code-facing. This is the phase's final deliverable, handed to the human to run through on an actual Windows machine with a USB barcode scanner.

**Context for whoever writes this:** spec §17 ("Definition of Done") lists ten checklist items for the whole MVP. Six of them are already provably true from automated tests written in Phases 1-5 (pricing math, complete-sale transaction atomicity, stock deduction, Dashboard reflecting a new sale, seed data, automated test coverage itself). The remaining four need a real Windows machine and real hardware, which nothing in this session can provide or verify — this document is exactly those four, plus the packaging-specific items this phase's own work makes newly relevant (installing the actual `.exe`, confirming Windows SmartScreen's expected unsigned-app warning, confirming the app's data directory ends up in the right place post-install).

- [ ] **Step 1: Write `docs/smoke-test-checklist.md`**

```markdown
# Smoke Test Checklist — Windows Installer

Run this checklist on a real Windows machine after building a release with
`npm run build:win`. Everything here needs real hardware or a real install
and can't be verified by automated tests or by the sandbox this project is
usually developed in.

The installer is unsigned (no code-signing certificate — out of scope for
MVP, see the project's `docs/superpowers/plans/2026-09-04-phase6-windows-packaging-smoke-test.md`).
Windows SmartScreen **will** show an "unrecognized app" warning the first
time you run `POS-<version>-setup.exe` — this is expected, not a bug. Click
"More info" → "Run anyway" to proceed.

## 1. Install

- [ ] Copy `dist/POS-<version>-setup.exe` to the target Windows machine (or build directly on it).
- [ ] Run the installer. Confirm:
  - [ ] SmartScreen warning appears (expected — see above) and "Run anyway" proceeds.
  - [ ] Installer completes without error.
  - [ ] A desktop shortcut named "POS" was created.
  - [ ] The app appears in Windows Settings → Apps as "POS".
- [ ] Launch the app from the desktop shortcut. Confirm it opens to the POS tab with an empty cart, and the barcode field is focused automatically.
- [ ] Close the app, then check `%APPDATA%\POS\pos.db` exists (Electron's userData path for this app — confirms the packaged `getDbPath()`/`getMigrationsPath()` fix from this phase is working end-to-end on a real install, not just in the sandbox's smoke test).

## 2. Barcode scanner (spec §17: "ต่อ USB Barcode Scanner แล้วสแกนสินค้าจริงได้")

- [ ] Connect a USB barcode scanner configured in keyboard-emulation mode (the standard mode for this class of scanner — see spec §10.1).
- [ ] Add at least 2 real products via the Products tab (or use seed data — see §3 below) with real barcodes.
- [ ] On the POS tab, click into the barcode field, then scan a physical barcode without touching the keyboard. Confirm the product is added to the cart with quantity 1.
- [ ] Scan the same barcode again. Confirm the quantity increments to 2, without needing to click back into the field (the field should already have refocused itself after the first scan).
- [ ] Scan a second, different product. Confirm it appears as its own line.
- [ ] Scan several items in a row with no mouse clicks in between (spec §17: "สแกนหลายรายการต่อเนื่องโดยไม่ต้องใช้เมาส์" — scan multiple items continuously without using the mouse). Confirm every scan lands correctly.
- [ ] Scan a barcode that doesn't match any product. Confirm a clear "Barcode not found" message appears and the cart is unchanged.

## 3. End-to-end sale (spec §17: full flow + Dashboard)

- [ ] With 2+ items in the cart, confirm the running Total updates correctly as you scan.
- [ ] Click "Finish Sale". Confirm: the cart clears, a success message with the correct total appears, and no error is shown.
- [ ] Go to the Products tab and confirm the stock for each sold item decreased by exactly the quantity sold.
- [ ] Go to the Dashboard tab. Confirm "Sales Today", "Orders Today", and "Units Sold Today" all reflect the sale you just completed (spec §17: "Dashboard แสดงยอดขายหลังการขายทันที" — Dashboard shows sales immediately after the sale).
- [ ] Go to the Sales History tab. Confirm the new sale appears at the top of the list with the correct total, and clicking "View" shows the correct line items.

## 4. Uninstall (optional, but good practice before repeating this checklist on the same machine)

- [ ] Uninstall via Windows Settings → Apps → POS → Uninstall.
- [ ] Confirm the Start Menu/desktop shortcut is removed.
- [ ] Note: `%APPDATA%\POS\pos.db` is intentionally NOT removed by uninstall (matches typical Windows app behavior — user data persists across reinstall). Delete it manually only if you want a fully clean slate for the next test run.

## If anything fails

Note exactly which checklist item failed, what you observed instead, and
whether it reproduces on a second attempt, then report it back rather than
trying to fix packaging config directly on the test machine — packaging
fixes belong in `electron-builder.yml`/`package.json`/`src/main/database/db-path.ts`
in the repo, verified with `npm run build:win` + `npm run smoke:package`
before producing another installer to retest.
```

- [ ] **Step 2: Self-review the document against spec §17**

Re-read spec §17's ten Definition of Done items and confirm every one that requires real hardware/a real install is covered above, and every one already covered by automated tests is not duplicated here unnecessarily. (It's fine that §2/§3 of the checklist re-confirm things automated tests already proved in isolation — e.g. stock deduction — since the point here is confirming the *integrated, installed* app behaves correctly, not re-deriving unit-level correctness.)

- [ ] **Step 3: Commit**

```bash
git add docs/smoke-test-checklist.md
git commit -m "docs: add Windows installer smoke-test checklist"
```

---

## Definition of Done

- `npm test`, `npm run typecheck`, and `npm run lint` all pass with no regressions (Tasks 1-2 verify this directly; Tasks 3-4 don't touch application code).
- `npm run build:win` produces a working NSIS installer and an unpacked build with no placeholder branding remaining.
- `npm run smoke:package` passes against that build, proving the native SQLite binding and the bundled Drizzle migrations both work under Electron's actual packaged runtime — closing the one real bug this phase's investigation found (migrations weren't bundled at all).
- `docs/smoke-test-checklist.md` exists and gives the user everything needed to verify the remaining spec §17 items that require a real Windows machine and real USB hardware — nothing that needs physical hardware is left unverifiable-in-principle, even though this session can't perform those checks itself.

## What this phase doesn't cover

- **Actually running the installer to install the app**, or physically testing a USB barcode scanner — both require a real machine/hardware this session doesn't have, and installing software system-wide is outside what an agent should do unprompted regardless. Handed off via Task 4's checklist.
- **Code signing** — no certificate exists or is budgeted for; spec §18 explicitly warns against over-engineering ahead of real need. The unsigned-installer SmartScreen warning is documented as expected, not fixed.
- **Auto-update** — the scaffold's placeholder `publish` config pointed at a URL that was never real; removed rather than implemented. Nothing in spec §1-18 asks for auto-update in the MVP.
- **mac/linux packaging** — `electron-builder.yml` still has `mac`/`linux`/`dmg`/`appImage` sections from the scaffold; spec's own tech-stack table says "Desktop: Electron... เข้าถึง Windows/Node/native integration ได้สะดวก" and the whole MVP is scoped to Windows POS hardware — those sections are left as-is (harmless, unused) rather than removed, since removing them isn't asked for and isn't this phase's job either.
- **Multi-device sync, cloud, or any Phase 7+ concern** — spec §16 explicitly defers these to a future scale-up phase not on this roadmap.
