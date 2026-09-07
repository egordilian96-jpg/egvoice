import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db';
import { users, type PublicUser, toPublicUser } from '../shared/schema';
import { eq } from 'drizzle-orm';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me-in-prod';
const JWT_EXPIRES = '30d';

if (JWT_SECRET === 'dev-secret-change-me-in-prod' && process.env.NODE_ENV === 'production') {
  console.warn('[auth] ВНИМАНИЕ: JWT_SECRET не задан в production!');
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

export function verifyToken(token: string): { sub: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    return payload;
  } catch {
    return null;
  }
}

// Расширяем Request типом user
declare global {
  namespace Express {
    interface Request {
      user?: PublicUser;
    }
  }
}

/**
 * Middleware: проверяет Bearer-токен, кладёт user в req.user.
 * Возвращает 401 если токен невалидный или юзер не найден.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.header('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Требуется авторизация' });
  }
  const token = auth.slice('Bearer '.length);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ message: 'Токен недействителен' });
  }
  const [u] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
  if (!u) {
    return res.status(401).json({ message: 'Пользователь не найден' });
  }
  req.user = toPublicUser(u);
  next();
}

/**
 * То же, но не валит 401 — просто ставит user или undefined.
 * Полезно для эндпоинтов доступных гостям.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const auth = req.header('authorization');
  if (!auth?.startsWith('Bearer ')) return next();
  const payload = verifyToken(auth.slice(7));
  if (!payload) return next();
  const [u] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
  if (u) req.user = toPublicUser(u);
  next();
}

// Палитра цветов для аватарок — детерминированно от email
export function pickAvatarColor(seed: string): string {
  const palette = ['#e11d48', '#f97316', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#0ea5e9', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}
