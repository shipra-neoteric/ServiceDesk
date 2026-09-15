import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = path.resolve(__dirname, '../prisma/test.db');

export default async function globalSetup() {
  if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH);
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'inherit',
  });
}
