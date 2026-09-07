import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { z } from 'zod';

// ============================================================================
// USERS
// ============================================================================
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  nickname: text('nickname').notNull(),
  avatarColor: text('avatar_color').notNull().default('#3b82f6'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
});

// ============================================================================
// SERVERS (aka "гильдии" в Discord)
// ============================================================================
export const servers = sqliteTable('servers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ============================================================================
// SERVER MEMBERSHIP
// ============================================================================
export const serverMembers = sqliteTable('server_members', {
  id: text('id').primaryKey(),
  serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  joinedAt: integer('joined_at', { mode: 'timestamp' }).notNull(),
});

// ============================================================================
// CHANNELS (text | voice)
// ============================================================================
export const channels = sqliteTable('channels', {
  id: text('id').primaryKey(),
  serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type', { enum: ['text', 'voice'] }).notNull(),
  position: integer('position').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ============================================================================
// MESSAGES
// ============================================================================
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().references(() => users.id),
  text: text('text').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ============================================================================
// INVITES
// ============================================================================
export const invites = sqliteTable('invites', {
  code: text('code').primaryKey(),
  serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  maxUses: integer('max_uses'),
  uses: integer('uses').notNull().default(0),
});

// ============================================================================
// RELATIONS
// ============================================================================
export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(serverMembers),
  ownedServers: many(servers),
  messages: many(messages),
}));

export const serversRelations = relations(servers, ({ one, many }) => ({
  owner: one(users, { fields: [servers.ownerId], references: [users.id] }),
  members: many(serverMembers),
  channels: many(channels),
  invites: many(invites),
}));

export const serverMembersRelations = relations(serverMembers, ({ one }) => ({
  server: one(servers, { fields: [serverMembers.serverId], references: [servers.id] }),
  user: one(users, { fields: [serverMembers.userId], references: [users.id] }),
}));

export const channelsRelations = relations(channels, ({ one, many }) => ({
  server: one(servers, { fields: [channels.serverId], references: [servers.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  channel: one(channels, { fields: [messages.channelId], references: [channels.id] }),
  author: one(users, { fields: [messages.authorId], references: [users.id] }),
}));

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================
export const registerSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(6, 'Пароль минимум 6 символов').max(72, 'Слишком длинный пароль'),
  nickname: z.string().min(2, 'Ник минимум 2 символа').max(20, 'Ник максимум 20 символов'),
});

export const loginSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(1, 'Введи пароль'),
});

export const createServerSchema = z.object({
  name: z.string().min(2, 'Название минимум 2 символа').max(40),
});

export const createChannelSchema = z.object({
  name: z.string().min(1).max(40).regex(/^[a-zа-я0-9-]+$/i, 'Только буквы, цифры и дефис'),
  type: z.enum(['text', 'voice']),
});

export const sendMessageSchema = z.object({
  text: z.string().min(1).max(2000),
});

export const createInviteSchema = z.object({
  expiresInHours: z.number().min(1).max(24 * 7).optional(),
  maxUses: z.number().min(1).max(100).optional(),
});

// ============================================================================
// TYPES
// ============================================================================
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Server = typeof servers.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Invite = typeof invites.$inferSelect;
export type ServerMember = typeof serverMembers.$inferSelect;

// User без хеша пароля (то, что отдаём в API)
export type PublicUser = Omit<User, 'passwordHash'>;

export function toPublicUser(u: User): PublicUser {
  const { passwordHash, ...rest } = u;
  return rest;
}
