import { prisma } from './db.js';
import { isOpenStatus, type JobStatus } from '@servicedesk/shared';

/** Warns, never blocks (§10). Looks for recent unresolved jobs in the same
 * project/location/category as a candidate new request. */
export async function findPossibleDuplicates(params: {
  projectId: string;
  locationText: string;
  categoryId: string;
  assetTag?: string | null;
}) {
  const candidates = await prisma.jobCard.findMany({
    where: {
      projectId: params.projectId,
      categoryId: params.categoryId,
      createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30) },
    },
    include: { location: true },
    orderBy: { createdAt: 'desc' },
    take: 25,
  });

  const normalizedLoc = params.locationText.trim().toLowerCase();
  return candidates.filter((job) => {
    if (!isOpenStatus(job.status as JobStatus)) return false;
    if (params.assetTag && job.assetTag && job.assetTag === params.assetTag) return true;
    return job.locationText.trim().toLowerCase() === normalizedLoc;
  });
}
