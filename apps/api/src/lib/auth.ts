import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// No hardcoded fallback: index.ts's requireEnv() already exits the process before this module
// signs/verifies anything in the real server, but a silent 'dev-access-secret' default here
// would still be a live footgun for any other entrypoint (a script, a future serverless
// handler) that imports this module without going through that startup check. Fail loudly
// instead — vitest.config.ts / apps/api/.env supply real values for tests and dev.
function requireSecret(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy apps/api/.env.example to .env first.`);
  return value;
}
const ACCESS_SECRET = requireSecret('JWT_ACCESS_SECRET');
const REFRESH_SECRET = requireSecret('JWT_REFRESH_SECRET');

export interface AccessTokenPayload {
  sub: string; // userId
}

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export const signAccessToken = (userId: string) =>
  jwt.sign({ sub: userId } satisfies AccessTokenPayload, ACCESS_SECRET, { expiresIn: '2h' });

export const signRefreshToken = (userId: string) =>
  jwt.sign({ sub: userId } satisfies AccessTokenPayload, REFRESH_SECRET, { expiresIn: '30d' });

export const verifyAccessToken = (token: string): AccessTokenPayload => jwt.verify(token, ACCESS_SECRET) as AccessTokenPayload;
export const verifyRefreshToken = (token: string): AccessTokenPayload => jwt.verify(token, REFRESH_SECRET) as AccessTokenPayload;
