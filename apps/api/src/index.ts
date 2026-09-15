import 'dotenv/config';
import { createApp } from './app.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    // eslint-disable-next-line no-console
    console.error(`Missing required environment variable ${name}. Copy .env.example to .env first.`);
    process.exit(1);
  }
  return value;
}

requireEnv('DATABASE_URL');
requireEnv('JWT_ACCESS_SECRET');
requireEnv('JWT_REFRESH_SECRET');

const app = createApp();
const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`ServiceDesk API listening on http://localhost:${port}`);
});
