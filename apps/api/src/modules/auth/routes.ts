import { Router } from 'express';
import { LoginSchema } from '@servicedesk/shared';
import { prisma } from '../../lib/db.js';
import { signAccessToken, signRefreshToken, verifyPassword, verifyRefreshToken } from '../../lib/auth.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { badRequest, unauthorized } from '../../lib/httpError.js';
import { loadAccessContext } from '../../lib/accessContext.js';
import { requireAuth } from '../../middleware/requireAuth.js';

export const authRouter = Router();

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid login payload', parsed.error.flatten());
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.active) throw unauthorized('Invalid email or password');
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw unauthorized('Invalid email or password');

    const accessToken = signAccessToken(user.id);
    const refreshToken = signRefreshToken(user.id);
    const ctx = await loadAccessContext(user.id);
    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: ctx?.roleKeys ?? [],
        permissions: ctx ? Array.from(ctx.permissions) : [],
        projectAccess: ctx?.projectAccess ?? [],
        canViewAllProjects: ctx?.canViewAllProjects ?? false,
      },
    });
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) throw badRequest('refreshToken required');
    try {
      const payload = verifyRefreshToken(refreshToken);
      const accessToken = signAccessToken(payload.sub);
      res.json({ accessToken });
    } catch {
      throw unauthorized('Invalid refresh token');
    }
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ctx = req.access!;
    res.json({
      id: ctx.userId,
      email: ctx.email,
      name: ctx.name,
      roles: ctx.roleKeys,
      permissions: Array.from(ctx.permissions),
      projectAccess: ctx.projectAccess,
      canViewAllProjects: ctx.canViewAllProjects,
    });
  }),
);
