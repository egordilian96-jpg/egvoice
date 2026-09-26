import type { Express, Request, Response, NextFunction } from 'express';
import { sqlite } from './db';
import { requireAuth } from './auth';

type Pair = { user_low: string; user_high: string; sender_id: string; status: 'pending' | 'accepted' };
type Person = { id: string; nickname: string; avatarColor: string };
const personSql = 'SELECT id, nickname, avatar_color AS avatarColor FROM users WHERE id = ?';
const getPerson = (id: string) => sqlite.prepare(personSql).get(id) as Person | undefined;
const key = (a: string, b: string) => [a, b].sort();
const getPair = (a: string, b: string) => sqlite.prepare('SELECT * FROM friendships WHERE user_low = ? AND user_high = ?').get(...key(a, b)) as Pair | undefined;
const attempts = new Map<string, { at: number; count: number }>();
function limit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now(), id = req.user!.id;
  for (const [id, value] of attempts) if (now - value.at > 60000) attempts.delete(id);
  const bucket = attempts.get(id) ?? { at: now, count: 0 };
  bucket.count++; attempts.set(id, bucket);
  if (bucket.count > 30) return res.status(429).set('Retry-After', '60').json({ message: 'Слишком много запросов. Подожди минуту.' });
  next();
}

export function registerFriends(app: Express) {
  // Additive migration: existing accounts/servers/channels are not replaced.
  sqlite.exec(`CREATE TABLE IF NOT EXISTS friendships (
    user_low TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_high TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('pending','accepted')),
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(user_low,user_high),
    CHECK(user_low < user_high),
    CHECK(sender_id = user_low OR sender_id = user_high)
  )`);
  const cols = sqlite.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!cols.some(c => c.name === 'nickname_key')) sqlite.exec("ALTER TABLE users ADD COLUMN nickname_key TEXT NOT NULL DEFAULT ''");
  const indexName = sqlite.prepare('UPDATE users SET nickname_key = ? WHERE id = ?');
  sqlite.transaction(() => {
    for (const user of sqlite.prepare("SELECT id, nickname FROM users WHERE nickname_key = ''").all() as Person[]) indexName.run(user.nickname.toLocaleLowerCase('ru'), user.id);
  })();
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_users_nickname_key ON users(nickname_key)');

  app.get('/api/friends', requireAuth, (_req, res) => {
    const id = _req.user!.id;
    const rows = sqlite.prepare('SELECT * FROM friendships WHERE user_low = ? OR user_high = ?').all(id, id) as Pair[];
    const friends: Person[] = [], incoming: Person[] = [], outgoing: Person[] = [];
    for (const row of rows) {
      const person = getPerson(row.user_low === id ? row.user_high : row.user_low);
      if (!person) continue;
      (row.status === 'accepted' ? friends : row.sender_id === id ? outgoing : incoming).push(person);
    }
    res.json({ friends, incoming, outgoing });
  });
  app.get('/api/users/search', requireAuth, limit, (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 2 || q.length > 40) return res.status(400).json({ message: 'Введи от 2 до 40 символов ника или точный ID.' });
    const id = req.user!.id;
    const found = sqlite.prepare(`SELECT id, nickname, avatar_color AS avatarColor FROM users
      WHERE id <> ? AND (instr(nickname_key, ?) > 0 OR id = ?) ORDER BY nickname_key, id LIMIT 20`)
      .all(id, q.toLocaleLowerCase('ru'), q) as Person[];
    res.json({ users: found.map(person => {
      const pair = getPair(id, person.id);
      return { ...person, relationship: !pair ? 'none' : pair.status === 'accepted' ? 'friend' : pair.sender_id === id ? 'outgoing' : 'incoming' };
    }) });
  });
  app.post('/api/friends/requests', requireAuth, limit, (req, res) => {
    const me = req.user!.id, target = req.body?.userId;
    if (typeof target !== 'string' || target.length > 64 || target === me) return res.status(400).json({ message: 'Выбери другого пользователя.' });
    if (!getPerson(target)) return res.status(404).json({ message: 'Пользователь не найден.' });
    const result = sqlite.transaction(() => {
      const pair = getPair(me, target);
      if (pair) return pair.status === 'accepted' ? 'friend' : pair.sender_id === me ? 'outgoing' : 'incoming';
      const pending = sqlite.prepare("SELECT count(*) AS n FROM friendships WHERE sender_id = ? AND status = 'pending'").get(me) as { n: number };
      if (pending.n >= 30) return 'limit';
      sqlite.prepare("INSERT INTO friendships VALUES (?, ?, ?, 'pending', ?)").run(...key(me, target), me, Date.now());
      return 'outgoing';
    }).immediate();
    if (result === 'limit') return res.status(429).json({ message: 'У тебя уже 30 исходящих заявок. Сначала отмени ненужные.' });
    if (result === 'incoming') return res.status(409).json({ message: 'Этот человек уже прислал заявку. Прими её во входящих.' });
    res.json({ relationship: result });
  });
  app.post('/api/friends/requests/:id/:action', requireAuth, limit, (req, res) => {
    const me = req.user!.id, target = String(req.params.id), action = String(req.params.action);
    if (!['accept', 'decline', 'cancel'].includes(action)) return res.status(400).json({ message: 'Неизвестное действие.' });
    const outcome = sqlite.transaction(() => {
      const pair = getPair(me, target);
      if (!pair) return { status: 404, message: 'Заявка уже обработана или отменена.' };
      if (pair.status === 'accepted') return action === 'accept'
        ? { status: 200, message: 'Вы уже друзья.' }
        : { status: 409, message: 'Заявка уже принята.' };
      if ((action === 'cancel') !== (pair.sender_id === me)) return { status: 403, message: 'Это действие недоступно для этой заявки.' };
      if (action === 'accept') sqlite.prepare("UPDATE friendships SET status = 'accepted', updated_at = ? WHERE user_low = ? AND user_high = ?").run(Date.now(), ...key(me, target));
      else sqlite.prepare('DELETE FROM friendships WHERE user_low = ? AND user_high = ?').run(...key(me, target));
      return { status: 200, message: 'Готово' };
    }).immediate();
    res.status(outcome.status).json({ message: outcome.message });
  });
}
