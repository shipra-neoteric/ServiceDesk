import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../lib/auth.js';
import { loadAccessContext, type AccessContext } from '../lib/accessContext.js';
import { unauthorized } from '../lib/httpError.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      access?: AccessContext;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized('Missing bearer token');
    const token = header.slice('Bearer '.length);
    const payload = verifyAccessToken(token);
    const ctx = await loadAccessContext(payload.sub);
    if (!ctx || !ctx.active) throw unauthorized('Account inactive or not found');
    req.access = ctx;
    next();
  } catch (err) {
    next(unauthorized('Invalid or expired session'));
  }
}
