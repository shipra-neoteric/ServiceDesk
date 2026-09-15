import type { NextFunction, Request, Response } from 'express';
import type { PermissionKey } from '@servicedesk/shared';
import { forbidden, unauthorized } from '../lib/httpError.js';

export const requirePermission =
  (...keys: PermissionKey[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.access) return next(unauthorized());
    const ok = keys.some((k) => req.access!.permissions.has(k));
    if (!ok) return next(forbidden(`Missing permission: ${keys.join(' or ')}`));
    next();
  };
