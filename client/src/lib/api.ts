// Простой fetch-обёрточный клиент. Токен читаем/пишем в localStorage.

// В превью-сборке (deploy_website) этот плейсхолдер будет заменён
// на прокси-URL до нашего sandbox-бэка (port 5000). В самохосте (docker) плейсхолдер
// останется как есть — тогда API_BASE = '' и запросы идут на тот же origin.
const API_PLACEHOLDER = '__PORT_5000__';
export const API_BASE = API_PLACEHOLDER.startsWith('__') ? '' : API_PLACEHOLDER;

const TOKEN_KEY = 'egv.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const contentType = res.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = typeof body === 'object' && body?.message ? body.message : res.statusText;
    throw new ApiError(msg, res.status);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: data ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// ===== TYPES =====
export type PublicUser = {
  id: string;
  email: string;
  nickname: string;
  avatarColor: string;
  createdAt: string | Date;
  lastSeenAt?: string | Date | null;
};

export type Server = {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string | Date;
};

export type Channel = {
  id: string;
  serverId: string;
  name: string;
  type: 'text' | 'voice';
  position: number;
  createdAt: string | Date;
};

export type Message = {
  id: string;
  channelId: string;
  authorId: string;
  text: string;
  createdAt: string | Date;
  authorNickname: string;
  authorColor: string;
};

export type Member = {
  id: string;
  nickname: string;
  avatarColor: string;
  lastSeenAt?: string | Date | null;
};
