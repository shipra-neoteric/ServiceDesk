import { PrismaClient } from '@prisma/client';

// Prisma's default interactive-transaction timeout is 5000ms, tuned for a local/low-latency
// database. Every multi-step workflow transition in this app (job creation, stage advancement,
// hold/resume, user CRUD) runs inside a $transaction, and a real MongoDB Atlas cluster's network
// round-trip time alone can push a several-step transaction past that default — confirmed live:
// seeding demo Job Cards against a real Atlas cluster hit `P2028 Transaction already closed`
// at 5932ms. Raised to 20s here (once, globally) rather than per call site.
export const prisma = new PrismaClient({
  transactionOptions: { timeout: 20_000 },
});
