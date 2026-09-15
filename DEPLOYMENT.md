# Deployment — MongoDB Atlas + Render + Vercel

This is the concrete, step-by-step path to a live deployment: **MongoDB Atlas** for the database,
**Render** for the Express API, **Vercel** for the static React frontend. It assumes you have (or
will create) free-tier accounts on all three — nothing here requires a paid plan to get a working
deployment, though see the "Before this is production-ready" note at the end.

None of this has been run end to end in this environment (no Atlas/Render/Vercel account access
was available) — schema validity, `npm run build`, and a local `node apps/api/dist/index.js` boot
were verified instead (see README's "Deployment hardening pass"). Follow these steps in order;
each one unblocks the next.

## 1. MongoDB Atlas

1. Create a free account at Atlas, then create a **free M0 cluster** (Shared, region close to
   your Render region). M0 clusters run as a 3-node replica set by default — this matters because
   Prisma's `$transaction` calls (used throughout the workflow engine) require a replica set, not
   a standalone `mongod`.
2. **Database Access** -> add a database user (username/password auth is fine) with
   `readWrite` on the database you'll use.
3. **Network Access** -> add an IP allowlist entry. Since Render's outbound IPs aren't static on
   the free/starter plan, allow `0.0.0.0/0` ("allow access from anywhere") and rely on the
   database username/password for security — this is Atlas's own documented approach for hosts
   without static egress IPs.
4. **Connect** -> "Drivers" -> copy the `mongodb+srv://...` connection string. Add a database name
   into the path before the `?` query string, e.g.:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/servicedesk?retryWrites=true&w=majority
   ```
5. Create a **second** database for tests the same way, changing only the path segment, e.g.
   `.../servicedesk_test?...` — the test suite drops this database completely before every run
   (see `apps/api/test/globalSetup.ts`), so it must never be the same database as production/dev.

You now have two connection strings: one for `DATABASE_URL`, one for `TEST_DATABASE_URL`.

## 2. Render (API)

You can use the committed `render.yaml` Blueprint (Render dashboard -> New -> Blueprint -> select
this repo) or create the Web Service by hand with these settings:

| Setting | Value |
|---|---|
| Runtime | Node |
| Build Command | `npm install && npm run build --workspace packages/shared && npm run build --workspace apps/api` |
| Start Command | `node apps/api/dist/index.js` |
| Health Check Path | `/health` |

Environment variables to set (Render dashboard -> Environment):

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Atlas connection string from step 1 |
| `JWT_ACCESS_SECRET` | a long random string (e.g. `openssl rand -hex 32`) |
| `JWT_REFRESH_SECRET` | a different long random string |
| `CORS_ORIGIN` | your Vercel URL — you won't know this until step 3; set a placeholder now and come back |
| `LOGIN_RATE_LIMIT` | `20` or similar for an internet-facing deployment (default `200` assumes an internal network — see README) |
| `NODE_ENV` | `production` |
| `BOOTSTRAP_ADMIN_EMAIL` | the email for your first real login |
| `BOOTSTRAP_ADMIN_PASSWORD` | 12+ characters — this creates the account, so use a real password, not a placeholder |
| `BOOTSTRAP_ADMIN_NAME` | optional, defaults to "Master Admin" |

Deploy. Once it's live, open a Render Shell (dashboard -> Shell) on the service and run:

```bash
npm run bootstrap --workspace apps/api
```

This seeds roles/permissions/job types/priorities/workflow templates/reason codes and creates your
one real Master Admin account from the env vars above (skips admin creation if the vars aren't
set; never overwrites an existing account — see `apps/api/src/seed/bootstrap.ts`). Run it again
after any future deploy that changes `systemDefaults.ts` — it's idempotent.

Confirm the API is up: `curl https://<your-service>.onrender.com/health` should return `{"ok":true}`.

## 3. Vercel (frontend)

Import the repo into Vercel. The committed `vercel.json` at the repo root configures the monorepo
build for you (Vercel auto-detects it) — **do not** set the Vercel project's "Root Directory" to
`apps/web`; leave it at the repo root, because `apps/web` depends on the `packages/shared`
workspace and a build scoped only to the subfolder can't resolve it.

Environment variables (Vercel dashboard -> Settings -> Environment Variables — these are baked in
at build time, so changing them requires a redeploy):

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | your Render URL, e.g. `https://servicedesk-api.onrender.com` |
| `VITE_APP_NAME` | `ServiceDesk` |
| `VITE_ENVIRONMENT` | `production` |
| `VITE_NEXORA_ORIGIN` | leave blank (documented seam, not wired up — see `ARCHITECTURE.md` §4) |
| `VITE_AUTH_CLIENT_ID` | leave blank (same reason) |

Deploy. Vercel gives you a `https://<project>.vercel.app` URL (or your custom domain).

## 4. Close the loop: CORS

Go back to Render and set `CORS_ORIGIN` to the real Vercel URL from step 3 (exact origin, no
trailing slash, e.g. `https://servicedesk.vercel.app`), then redeploy the Render service (env var
changes require a redeploy to take effect, same as Vercel). Until this is set correctly, the
frontend's requests to the API will be blocked by the browser's CORS policy — log in and check the
browser console if things look broken after deploying.

## 5. Verify

1. Open the Vercel URL, log in with the `BOOTSTRAP_ADMIN_EMAIL`/`PASSWORD` you set in step 2.
2. Use Masters (as Master Admin) to create your real Projects, Work Categories, and any additional
   users — the production bootstrap deliberately creates none of this (see README's "Deployment
   hardening pass" for why).
3. Create a test Job Card end to end to confirm the API/DB/frontend are actually wired together,
   then delete it.

## Local development against the same Atlas cluster

You can point local dev at the same Atlas cluster (different database name than production, e.g.
`servicedesk_dev`) instead of running a separate local database. Copy `apps/api/.env.example` to
`.env` and fill in `DATABASE_URL`/`TEST_DATABASE_URL` with your own Atlas connection strings — see
the comments in `.env.example` for the exact format and the constraint that `TEST_DATABASE_URL`
must differ from `DATABASE_URL`.

## Before this is production-ready

These are tracked in README's "Production readiness before go-live" list — most relevant to this
deployment specifically:

- **Attachments are stored on Render's local disk** (`apps/api/uploads/`), which does not survive
  a redeploy on Render's default (ephemeral) filesystem. Either add a Render persistent Disk
  mounted over that directory, or move to S3-compatible object storage, before real evidence
  photos are uploaded in production.
- **Nothing in this repo has been run against a real Atlas cluster yet** — re-run
  `npm run test --workspace apps/api` (with `TEST_DATABASE_URL` set to a real, disposable Atlas
  database) and the full Playwright suite against a real deployment before trusting the pass
  counts recorded in README.
- Render's free tier spins down after inactivity; the first request after idle can take ~30-60s to
  respond (the service is cold-starting). This is a Render platform behavior, not a ServiceDesk
  bug — upgrade the Render plan if that's not acceptable for real users.
