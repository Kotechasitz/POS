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
