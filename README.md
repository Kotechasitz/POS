# POS

Windows desktop Point-of-Sale app for a single-store retail shop, built with Electron, React, and TypeScript. No login, no cloud sync — one device, one local SQLite database.

## Features

- **Products** — CRUD, barcode-based lookup, categories, and product images (picked from disk, copied into local app storage)
- **POS / Checkout** — barcode scan and click-to-add product grid, cart management, held/parked carts, discounts, payment-method capture (Cash / QR / Card) — `F12` finishes the sale
- **Sales History** — searchable/filterable list (payment method, status, date range), sale voiding with a required reason, CSV export
- **Dashboard** — Today / Last 7 Days stat cards with period-over-period growth, an hourly or daily sales chart, a payment-method breakdown donut chart, top products, and low-stock alerts
- **Windows packaging** — ships as a standalone installer via electron-builder

## Tech Stack

- **Shell:** Electron
- **UI:** React 19 + TypeScript
- **Data:** better-sqlite3 + Drizzle ORM, migrated with drizzle-kit
- **Build/dev:** electron-vite
- **Tests:** Vitest + React Testing Library
- **Lint/format:** ESLint + Prettier

## Project Setup

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

Runs the app with hot reload. Seed some sample products into the dev database first if you need data to work with:

```bash
npm run seed
```

### Build

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

`npm run build:unpack` builds without producing an installer, useful for quickly inspecting the packaged output.

## Testing & Quality

```bash
npm test              # run the full test suite once
npm run test:watch    # watch mode
npm run lint          # ESLint
npm run typecheck     # TypeScript, main + renderer
npm run format        # Prettier, writes changes
```

## Project Structure

```
src/
  main/                 # Electron main process
    database/           # Drizzle schema, client, repositories, migrations path helpers
    ipc/                 # ipcMain handlers, grouped by feature
    storage/             # Product image storage on disk
  preload/               # contextBridge API exposed to the renderer
  renderer/              # React app
    src/features/
      products/          # Product CRUD, categories
      cart/               # POS checkout screen, cart state, barcode scanning
      sales-history/     # Sales list, filters, void, CSV export
      dashboard/          # Stat cards, charts, top products, low stock
  shared/                 # Types shared between main and renderer
scripts/                  # Seed data, packaging smoke test
docs/superpowers/         # Design specs and implementation plans for each phase
```

## Data Storage

Everything lives under Electron's `userData` directory in production (a `dev.db` file at the repo root in development):

- `pos.db` — the SQLite database
- `product-images/` — copies of uploaded product images, named by UUID

The app never references an uploaded image from its original location — files are copied in on upload, so moving or deleting the source afterward doesn't break anything.
