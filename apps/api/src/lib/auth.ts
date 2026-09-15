import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret';

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
