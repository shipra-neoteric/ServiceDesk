import type { Prisma, PrismaClient } from '@prisma/client';

type Tx = PrismaClient | Prisma.TransactionClient;

export async function writeAudit(
  tx: Tx,
  params: {
    entityType: string;
    entityId: string;
    action: string;
    actorId: string;
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string;
  },
) {
  await tx.auditEvent.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      actorId: params.actorId,
      oldValue: params.oldValue !== undefined ? JSON.stringify(params.oldValue) : null,
      newValue: params.newValue !== undefined ? JSON.stringify(params.newValue) : null,
      reason: params.reason ?? null,
    },
  });
}
