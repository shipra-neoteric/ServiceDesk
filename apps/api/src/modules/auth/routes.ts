import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { LoginSchema } from '@servicedesk/shared';
import { prisma } from '../../lib/db.js';
import { signAccessToken, signRefreshToken, verifyPassword, verifyRefreshToken } from '../../lib/auth.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { badRequest, unauthorized } from '../../lib/httpError.js';
import { loadAccessContext } from '../../lib/accessContext.js';
import { requireAuth } from '../../middleware/requireAuth.js';

export const authRouter = Router();

// §56 "rate limiting where appropriate" — /auth/login is the one unauthenticated endpoint that
// takes a password, so it's the brute-force target. Keyed by IP. The limit is deliberately
// generous (not the ~10/15min a public-facing login would use) because this is an internal
// tool assumed to sit behind a corporate network/VPN, and because the committed Playwright
// suite logs in dozens of times per run from one IP — a tight limit would make CI flaky rather
// than making the app safer. Tune LOGIN_RATE_LIMIT down for an internet-facing deployment.
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_RATE_LIMIT ?? 200),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many login attempts. Please try again later.' } },
});

authRouter.post(
  '/login',
  loginRateLimit,
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
