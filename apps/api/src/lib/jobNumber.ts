import type { Prisma, PrismaClient } from '@prisma/client';

type Tx = PrismaClient | Prisma.TransactionClient;

/** Concurrency-safe JC-YYYY-NNNNNN generator (§67). Must be called inside the same
 * transaction as the JobCard insert so a crash never leaks a gap-free-but-unused number
 * silently past what's actually recorded. */
export async function nextJobNumber(tx: Tx): Promise<string> {
  const year = new Date().getFullYear();
  const key = `JOB_NUMBER_${year}`;
  const counter = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `JC-${year}-${String(counter.value).padStart(6, '0')}`;
}

export async function nextRequestNumber(tx: Tx): Promise<string> {
  const year = new Date().getFullYear();
  const key = `REQUEST_NUMBER_${year}`;
  const counter = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `SR-${year}-${String(counter.value).padStart(6, '0')}`;
}
