import { defineConfig } from 'vitest/config';
import 'dotenv/config';

// Tests need a disposable MongoDB database of their own — globalSetup.ts drops it completely
// before every run (the old SQLite setup just deleted a local file; there's no equivalent
// "just delete it" move for Atlas, so this has to be an explicit, separate database instead).
// Never point this at the same database as DATABASE_URL, or a test run will wipe real data.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL is not set. Add it to apps/api/.env — a MongoDB Atlas connection string ' +
      'pointing at a disposable test database (e.g. the same cluster as DATABASE_URL but with a ' +
      'different database name in the path, such as .../servicedesk_test). See .env.example.',
  );
}
if (TEST_DATABASE_URL === process.env.DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL must not be the same as DATABASE_URL — the test suite drops this database ' +
      'entirely (via $runCommandRaw({ dropDatabase: 1 })) before every run.',
  );
}

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/globalSetup.ts'],
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_ACCESS_SECRET: 'test-access-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      CORS_ORIGIN: 'http://localhost:5173',
    },
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
