import type { AccessContext } from './accessContext.js';

/** Prisma `where` fragment that scopes a JobCard/ServiceRequest query to the caller's
 * accessible projects, unless they hold job.view_all_projects. Used by every jobs/reports
 * query so project access cannot be bypassed by URL/body tampering (§38, PERMISSIONS.md). */
export function jobCardScopeWhere(ctx: AccessContext) {
  if (ctx.canViewAllProjects) return {};
  const projectIds = ctx.projectAccess.map((p) => p.projectId);
  return { projectId: { in: projectIds } };
}
