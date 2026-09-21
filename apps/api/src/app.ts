import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authRouter } from './modules/auth/routes.js';
import { mastersRouter } from './modules/masters/routes.js';
import { usersRouter } from './modules/users/routes.js';
import { jobsRouter } from './modules/jobs/routes.js';
import { attentionRouter } from './modules/attention/routes.js';
import { dashboardRouter } from './modules/dashboard/routes.js';
import { reportsRouter } from './modules/reports/routes.js';
import { attachmentsRouter } from './modules/attachments/routes.js';
import { legacyImportRouter } from './modules/legacyImport/routes.js';
import { errorHandler } from './middleware/errorHandler.js';

// CORS_ORIGIN accepts one or more comma-separated exact origins (e.g. the production Vercel
// domain plus its preview deployments) — a single hardcoded string meant every preview URL
// needed a manual env var edit to stop being blocked as a "Network error" in the browser.
function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function createApp() {
  const app = express();
  app.use(helmet());
  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGIN);
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header (server-to-server calls, curl, health checks) — allow.
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`Origin "${origin}" is not allowed by CORS_ORIGIN`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  // No express.static('/uploads') mount: attachment files are only reachable through the
  // authenticated, job-scoped route in modules/attachments/routes.ts (GET
  // /jobs/:jobId/attachments/:attachmentId/file) — see that file's doc comment for why.

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/auth', authRouter);
  app.use('/masters', mastersRouter);
  app.use('/users', usersRouter);
  app.use('/jobs', jobsRouter);
  app.use('/jobs', attachmentsRouter);
  app.use('/attention', attentionRouter);
  app.use('/dashboard', dashboardRouter);
  app.use('/reports', reportsRouter);
  app.use('/legacy-import', legacyImportRouter);

  app.use(errorHandler);
  return app;
}
