import 'dotenv/config';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL as string;

export default async function globalSetup() {
  // MongoDB has no local file to delete for a clean slate — drop the test database outright.
  // vitest.config.ts already refuses to start if this isn't a dedicated, non-dev database.
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
  try {
    await prisma.$runCommandRaw({ dropDatabase: 1 });
  } finally {
    await prisma.$disconnect();
  }

  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
