import type { Express, Request, Response } from 'express';
import type { Server as HttpServer } from 'node:http';
import { nanoid } from 'nanoid';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './db';
import {
  users, servers, serverMembers, channels, messages, invites,
  registerSchema, loginSchema, createServerSchema, createChannelSchema,
  sendMessageSchema, createInviteSchema, toPublicUser,
} from '../shared/schema';
import { hashPassword, verifyPassword, signToken, requireAuth, pickAvatarColor } from './auth';
import { createLiveKitToken, LIVEKIT_URL } from './livekit';
import { setupRealtime, broadcastToChannel, broadcastToServer } from './realtime';

// ---------- helpers ----------

function param(req: Request, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? v[0] : (v as string);
}

function handleZodError(err: unknown, res: Response) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      message: err.issues[0]?.message ?? 'Ошибка валидации',
      errors: err.issues,
    });
  }
  throw err;
}

async function isMemberOfChannel(userId: string, channelId: string) {
  const [row] = await db
    .select({ channelId: channels.id })
    .from(channels)
    .innerJoin(serverMembers, eq(serverMembers.serverId, channels.serverId))
    .where(and(eq(channels.id, channelId), eq(serverMembers.userId, userId)))
    .limit(1);
  return !!row;
}

async function isMemberOfServer(userId: string, serverId: string) {
  const [row] = await db
    .select({ id: serverMembers.id })
    .from(serverMembers)
    .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)))
    .limit(1);
  return !!row;
}

// ---------- routes ----------

export async function registerRoutes(httpServer: HttpServer, app: Express): Promise<HttpServer> {
  // WebSocket слой
  setupRealtime(httpServer);

  // ====== AUTH ======

  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const data = registerSchema.parse(req.body);
      const existing = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
      if (existing.length) {
        return res.status(409).json({ message: 'Пользователь с таким email уже есть' });
      }
      const id = nanoid(12);
      const passwordHash = await hashPassword(data.password);
      const now = new Date();
      const avatarColor = pickAvatarColor(data.email);
      await db.insert(users).values({
        id, email: data.email, passwordHash, nickname: data.nickname,
        avatarColor, createdAt: now, lastSeenAt: now,
      });
      const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      const token = signToken(id);
      res.json({ token, user: toPublicUser(u!) });
    } catch (err) { handleZodError(err, res); }
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const data = loginSchema.parse(req.body);
      const [u] = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
      if (!u) return res.status(401).json({ message: 'Неверный email или пароль' });
      const ok = await verifyPassword(data.password, u.passwordHash);
      if (!ok) return res.status(401).json({ message: 'Неверный email или пароль' });
      await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, u.id));
      const token = signToken(u.id);
      res.json({ token, user: toPublicUser(u) });
    } catch (err) { handleZodError(err, res); }
  });

  app.get('/api/auth/me', requireAuth, async (req: Request, res: Response) => {
    res.json({ user: req.user });
  });

  // ====== SERVERS ======

  app.get('/api/servers', requireAuth, async (req: Request, res: Response) => {
    const rows = await db
      .select({
        id: servers.id,
        name: servers.name,
        ownerId: servers.ownerId,
        createdAt: servers.createdAt,
      })
      .from(servers)
      .innerJoin(serverMembers, eq(serverMembers.serverId, servers.id))
      .where(eq(serverMembers.userId, req.user!.id))
      .orderBy(asc(servers.createdAt));
    res.json({ servers: rows });
  });

  app.post('/api/servers', requireAuth, async (req: Request, res: Response) => {
    try {
      const data = createServerSchema.parse(req.body);
      const id = nanoid(12);
      const now = new Date();
      db.transaction((tx) => {
        tx.insert(servers).values({ id, name: data.name, ownerId: req.user!.id, createdAt: now }).run();
        tx.insert(serverMembers).values({
          id: nanoid(12), serverId: id, userId: req.user!.id, joinedAt: now,
        }).run();
        tx.insert(channels).values([
          { id: nanoid(12), serverId: id, name: 'общий', type: 'text', position: 0, createdAt: now },
          { id: nanoid(12), serverId: id, name: 'общий', type: 'voice', position: 1, createdAt: now },
        ]).run();
      });
      const [srv] = await db.select().from(servers).where(eq(servers.id, id)).limit(1);
      res.json({ server: srv });
    } catch (err) { handleZodError(err, res); }
  });

  // ====== CHANNELS ======

  app.get('/api/servers/:serverId/channels', requireAuth, async (req: Request, res: Response) => {
    const serverId = param(req, 'serverId');
    if (!(await isMemberOfServer(req.user!.id, serverId))) {
      return res.status(403).json({ message: 'Нет доступа к серверу' });
    }
    const rows = await db.select().from(channels).where(eq(channels.serverId, serverId)).orderBy(asc(channels.position));
    res.json({ channels: rows });
  });

  app.post('/api/servers/:serverId/channels', requireAuth, async (req: Request, res: Response) => {
    try {
      const serverId = param(req, 'serverId');
      if (!(await isMemberOfServer(req.user!.id, serverId))) {
        return res.status(403).json({ message: 'Нет доступа к серверу' });
      }
      const data = createChannelSchema.parse(req.body);
      const id = nanoid(12);
      const existing = await db.select().from(channels).where(eq(channels.serverId, serverId));
      await db.insert(channels).values({
        id, serverId, name: data.name, type: data.type,
        position: existing.length, createdAt: new Date(),
      });
      const [ch] = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
      res.json({ channel: ch });
    } catch (err) { handleZodError(err, res); }
  });

  // ====== SERVER MEMBERS ======

  app.get('/api/servers/:serverId/members', requireAuth, async (req: Request, res: Response) => {
    const serverId = param(req, 'serverId');
    if (!(await isMemberOfServer(req.user!.id, serverId))) {
      return res.status(403).json({ message: 'Нет доступа' });
    }
    const rows = await db
      .select({
        id: users.id, nickname: users.nickname, avatarColor: users.avatarColor, lastSeenAt: users.lastSeenAt,
      })
      .from(users)
      .innerJoin(serverMembers, eq(serverMembers.userId, users.id))
      .where(eq(serverMembers.serverId, serverId));
    res.json({ members: rows });
  });

  // ====== MESSAGES ======

  app.get('/api/channels/:channelId/messages', requireAuth, async (req: Request, res: Response) => {
    const channelId = param(req, 'channelId');
    if (!(await isMemberOfChannel(req.user!.id, channelId))) {
      return res.status(403).json({ message: 'Нет доступа к каналу' });
    }
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const rows = await db
      .select({
        id: messages.id, channelId: messages.channelId, authorId: messages.authorId,
        text: messages.text, createdAt: messages.createdAt,
        authorNickname: users.nickname, authorColor: users.avatarColor,
      })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.authorId))
      .where(eq(messages.channelId, channelId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);
    res.json({ messages: rows.reverse() });
  });

  app.post('/api/channels/:channelId/messages', requireAuth, async (req: Request, res: Response) => {
    try {
      const channelId = param(req, 'channelId');
      if (!(await isMemberOfChannel(req.user!.id, channelId))) {
        return res.status(403).json({ message: 'Нет доступа к каналу' });
      }
      const data = sendMessageSchema.parse(req.body);
      const id = nanoid(16);
      const createdAt = new Date();
      await db.insert(messages).values({
        id, channelId, authorId: req.user!.id, text: data.text, createdAt,
      });
      const payload = {
        id, channelId, authorId: req.user!.id, text: data.text, createdAt,
        authorNickname: req.user!.nickname, authorColor: req.user!.avatarColor,
      };
      broadcastToChannel(channelId, { type: 'message', data: payload });
      res.json({ message: payload });
    } catch (err) { handleZodError(err, res); }
  });

  // ====== INVITES ======

  app.post('/api/servers/:serverId/invites', requireAuth, async (req: Request, res: Response) => {
    try {
      const serverId = param(req, 'serverId');
      if (!(await isMemberOfServer(req.user!.id, serverId))) {
        return res.status(403).json({ message: 'Нет доступа' });
      }
      const data = createInviteSchema.parse(req.body || {});
      const code = nanoid(8);
      const now = new Date();
      const expiresAt = data.expiresInHours
        ? new Date(now.getTime() + data.expiresInHours * 3600_000)
        : new Date(now.getTime() + 24 * 3600_000);
      await db.insert(invites).values({
        code, serverId, createdBy: req.user!.id, createdAt: now, expiresAt,
        maxUses: data.maxUses ?? null,
        uses: 0,
      });
      res.json({ code, expiresAt });
    } catch (err) { handleZodError(err, res); }
  });

  // Публичный (без auth) — чтобы показать превью инвайта
  app.get('/api/invites/:code', async (req: Request, res: Response) => {
    const code = param(req, 'code');
    const [inv] = await db.select().from(invites).where(eq(invites.code, code)).limit(1);
    if (!inv) return res.status(404).json({ message: 'Инвайт не найден' });
    if (inv.expiresAt && inv.expiresAt < new Date()) {
      return res.status(410).json({ message: 'Инвайт просрочен' });
    }
    if (inv.maxUses != null && inv.uses >= inv.maxUses) {
      return res.status(410).json({ message: 'Инвайт исчерпан' });
    }
    const [srv] = await db.select().from(servers).where(eq(servers.id, inv.serverId)).limit(1);
    if (!srv) return res.status(404).json({ message: 'Сервер удалён' });
    const [inviter] = await db.select({ nickname: users.nickname }).from(users).where(eq(users.id, inv.createdBy)).limit(1);
    res.json({
      server: { id: srv.id, name: srv.name },
      inviter: inviter?.nickname ?? 'кто-то',
    });
  });

  app.post('/api/invites/:code/accept', requireAuth, async (req: Request, res: Response) => {
    const code = param(req, 'code');
    const [inv] = await db.select().from(invites).where(eq(invites.code, code)).limit(1);
    if (!inv) return res.status(404).json({ message: 'Инвайт не найден' });
    if (inv.expiresAt && inv.expiresAt < new Date()) {
      return res.status(410).json({ message: 'Инвайт просрочен' });
    }
    if (inv.maxUses != null && inv.uses >= inv.maxUses) {
      return res.status(410).json({ message: 'Инвайт исчерпан' });
    }
    if (await isMemberOfServer(req.user!.id, inv.serverId)) {
      return res.json({ serverId: inv.serverId, alreadyMember: true });
    }
    db.transaction((tx) => {
      tx.insert(serverMembers).values({
        id: nanoid(12), serverId: inv.serverId, userId: req.user!.id, joinedAt: new Date(),
      }).run();
      tx.update(invites).set({ uses: inv.uses + 1 }).where(eq(invites.code, code)).run();
    });
    broadcastToServer(inv.serverId, { type: 'member-joined', data: { userId: req.user!.id, nickname: req.user!.nickname } });
    res.json({ serverId: inv.serverId });
  });

  // ====== LIVEKIT ======

  app.post('/api/livekit/token', requireAuth, async (req: Request, res: Response) => {
    const schema = z.object({ channelId: z.string() });
    try {
      const { channelId } = schema.parse(req.body);
      if (!(await isMemberOfChannel(req.user!.id, channelId))) {
        return res.status(403).json({ message: 'Нет доступа к каналу' });
      }
      const [ch] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
      if (!ch || ch.type !== 'voice') {
        return res.status(400).json({ message: 'Канал не голосовой' });
      }
      const token = await createLiveKitToken({
        userId: req.user!.id,
        nickname: req.user!.nickname,
        channelId,
      });
      res.json({ token, url: LIVEKIT_URL });
    } catch (err) { handleZodError(err, res); }
  });

  return httpServer;
}
