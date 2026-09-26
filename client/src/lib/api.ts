import { localStore } from './storage';

// Куда стучаться:
// - в Tauri-сборке стоит VITE_API_URL на прод-URL (берётся из .env.production)
// - в превью-сборке (deploy_website) плейсхолдер __PORT_5000__ заменяется на прокси
// - в опубликованном (publish_website на *.pplx.app) — прокси на /port/5000
// - в самохосте (docker) API_BASE = '' и запросы идут на тот же origin
const API_PLACEHOLDER = '__PORT_5000__';
const FROM_ENV = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

function computeApiBase(): string {
  // 1. Явный VITE_API_URL (Tauri, самохост с внешним backend)
  if (FROM_ENV) return FROM_ENV.replace(/\/$/, '');
  // 2. Placeholder заменён при deploy_website на реальный proxy URL
  if (!API_PLACEHOLDER.startsWith('__')) return API_PLACEHOLDER;
  // 3. Опубликованный сайт на *.pplx.app — backend через /port/5000
  if (typeof window !== 'undefined' && window.location.host.endsWith('.pplx.app')) {
    return window.location.origin + '/port/5000';
  }
  // 4. Fallback: тот же origin (dev-режим, docker с общим портом)
  return '';
}

export const API_BASE = computeApiBase();

// WS URL — от того же API_BASE, только схема http(s) -> ws(s)
export function getWsUrl(path: string): string {
  if (API_BASE) {
    return API_BASE.replace(/^http/, 'ws') + path;
  }
  // Относительный — от текущего origin
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}${path}`;
}

const TOKEN_KEY = 'egv.token';

export function getToken(): string | null {
  return localStore.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStore.setItem(TOKEN_KEY, token);
  else localStore.removeItem(TOKEN_KEY);
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
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers, signal: opts.signal ?? AbortSignal.timeout(20_000) });
  const contentType = res.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new Event('egv:session-expired'));
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
