# EG Voice

Голосовой мессенджер для геймеров, работающий в РФ без VPN. MVP для тусовки друзей до 10 человек.

- **Не жрёт FPS** — Tauri вместо Electron (десктоп-клиент в планах), веб-версия на LiveKit WebRTC.
- **Умное шумоподавление** — RNNoise, режимы «качество» и «киберспорт».
- **Продуманный UX** — сделано продуктовым дизайнером.

## Стек

- **Frontend:** React 18 + TypeScript, Vite, Tailwind, shadcn/ui, LiveKit Client SDK
- **Backend:** Node.js 20 + Express, SQLite (better-sqlite3) + Drizzle ORM, WebSocket
- **Реалтайм-голос:** LiveKit Server (self-hosted)
- **HTTPS / reverse proxy:** Caddy (автоматические сертификаты Let's Encrypt)
- **Оркестрация:** Docker Compose
- **Хостинг:** Selectel VPS (Ubuntu 24.04)

## Структура

```
eg-voice/
├── client/           # React-приложение (Vite)
├── server/           # Express API + WebSocket
├── shared/           # общий код (Drizzle schema, типы)
├── script/           # утилиты (миграции и т.п.)
├── Caddyfile         # конфиг reverse proxy + HTTPS
├── livekit.yaml      # конфиг LiveKit-сервера
├── docker-compose.yml
├── Dockerfile        # образ приложения (client build + server bundle)
├── .env.example      # шаблон переменных окружения
└── DEPLOY.md         # подробная инструкция деплоя на Selectel
```

## Быстрый старт (локально)

Требования: Node.js 20+, npm 10+.

```bash
git clone https://github.com/<твой-логин>/egvoice.git
cd egvoice
npm install
cp .env.example .env
# отредактируй .env — как минимум задай JWT_SECRET
npm run dev
```

Откроется на `http://localhost:5000`.

Для локального голоса дополнительно понадобится LiveKit — проще всего запустить его через docker-compose (см. `DEPLOY.md`, только `livekit` сервис).

## Продакшн-деплой

Полная пошаговая инструкция для Selectel VPS с доменом и HTTPS — в файле **[DEPLOY.md](./DEPLOY.md)**.

Кратко:

```bash
# на сервере
git clone https://github.com/<твой-логин>/egvoice.git /opt/egvoice
cd /opt/egvoice
cp .env.example .env
# заполни .env (домены, секреты)
docker compose up -d
```

## Переменные окружения

| Переменная | Что это |
|---|---|
| `DOMAIN` | Основной домен (например `egvoice.ru`) |
| `LIVEKIT_DOMAIN` | Поддомен для LiveKit WSS (например `livekit.egvoice.ru`) |
| `TURN_DOMAIN` | Поддомен для TURN-сервера |
| `LETSENCRYPT_EMAIL` | E-mail для алертов о сертификатах |
| `JWT_SECRET` | Секрет для подписи JWT-токенов (сгенерируй `openssl rand -hex 32`) |
| `LIVEKIT_API_KEY` | Ключ API LiveKit (сгенерируй `openssl rand -hex 8`) |
| `LIVEKIT_API_SECRET` | Секрет API LiveKit (`openssl rand -hex 32`) |
| `LIVEKIT_WS_URL` | Публичный WSS-URL LiveKit (`wss://livekit.egvoice.ru`) |
| `TURN_SECRET` | Секрет TURN (`openssl rand -hex 24`) |
| `DATABASE_PATH` | Путь к SQLite (по умолчанию `/data/egvoice.db` в контейнере) |
| `NODE_ENV` | `production` для прода |
| `PORT` | Порт HTTP-сервера (по умолчанию 5000) |

Полный шаблон — в [.env.example](./.env.example).

## Команды разработки

```bash
npm run dev           # запуск dev-режима (client + server, hot reload)
npm run build         # сборка client (Vite) + server (esbuild)
npm run start         # запуск собранного прода
npm run db:push       # применить схему Drizzle к SQLite
npx tsc --noEmit      # проверка типов
```

## Лицензия

MIT — см. [LICENSE](./LICENSE).
