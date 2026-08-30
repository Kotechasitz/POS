import { app } from 'electron';
import path from 'node:path';

export function getDbPath(): string {
  if (process.env.NODE_ENV === 'development') {
    return path.resolve(process.cwd(), 'dev.db');
  }
  return path.join(app.getPath('userData'), 'pos.db');
}
