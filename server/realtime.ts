import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import { verifyToken } from './auth';
import { db } from './db';
import { serverMembers, channels } from '../shared/schema';
import { eq, inArray } from 'drizzle-orm';

/**
 * Простой WS-хаб.
 * Подключение: ws://.../ws?token=<jwt>
 * После auth клиент числится подписанным на все серверы, где он состоит,
 * и все каналы этих серверов. При broadcastToChannel/Server рассылаем сообщение
 * всем подписанным сокетам.
 */

type Client = {
  ws: WebSocket;
  userId: string;
  serverIds: Set<string>;
  channelIds: Set<string>;
};

const clients = new Set<Client>();

export function setupRealtime(httpServer: HttpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const token = url.searchParams.get('token');
      if (!token) return ws.close(4001, 'no token');
      const payload = verifyToken(token);
      if (!payload) return ws.close(4001, 'bad token');

      // Загружаем серверы, где он состоит, и все каналы этих серверов.
      const memberships = await db
        .select({ serverId: serverMembers.serverId })
        .from(serverMembers)
        .where(eq(serverMembers.userId, payload.sub));
      const serverIds = new Set(memberships.map((m) => m.serverId));
      const chRows = serverIds.size
        ? await db.select({ id: channels.id }).from(channels).where(inArray(channels.serverId, [...serverIds]))
        : [];
      const channelIds = new Set(chRows.map((c) => c.id));

      const client: Client = { ws, userId: payload.sub, serverIds, channelIds };
      clients.add(client);

      ws.send(JSON.stringify({ type: 'hello', data: { userId: payload.sub } }));

      // Пингуем клиента, чтобы держать соединение живым
      const ping = setInterval(() => {
        try { ws.ping(); } catch { /* noop */ }
      }, 25_000);

      ws.on('close', () => {
        clearInterval(ping);
        clients.delete(client);
      });

      ws.on('error', () => {
        clearInterval(ping);
        clients.delete(client);
      });
    } catch (err) {
      console.error('[ws] handshake error', err);
      try { ws.close(1011); } catch { /* noop */ }
    }
  });

  console.log('[ws] realtime активен по /ws');
}

export function broadcastToChannel(channelId: string, msg: unknown) {
  const raw = JSON.stringify(msg);
  for (const c of clients) {
    if (c.channelIds.has(channelId) && c.ws.readyState === c.ws.OPEN) {
      c.ws.send(raw);
    }
  }
}

export function broadcastToServer(serverId: string, msg: unknown) {
  const raw = JSON.stringify(msg);
  for (const c of clients) {
    if (c.serverIds.has(serverId) && c.ws.readyState === c.ws.OPEN) {
      c.ws.send(raw);
    }
  }
}

/**
 * Приглашает пользователя в свежий сервер/канал без переподключения.
 * Вызываем, когда пользователь принял инвайт.
 */
export async function addUserToServerSubscription(userId: string, serverId: string) {
  const chRows = await db.select({ id: channels.id }).from(channels).where(eq(channels.serverId, serverId));
  for (const c of clients) {
    if (c.userId === userId) {
      c.serverIds.add(serverId);
      for (const ch of chRows) c.channelIds.add(ch.id);
    }
  }
}
