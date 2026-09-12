# EG Voice

Голосовой мессенджер для геймеров, работающий в РФ без VPN. MVP для тусовки друзей до 10 человек.

- **Не жрёт FPS** — Tauri вместо Electron, нативная Windows-сборка через WebView2.
- **Умное шумоподавление** — RNNoise, режимы «качество» и «киберспорт».

## Что где

```
eg-voice/
├── client/           # React 18 + TypeScript, Vite, Tailwind, shadcn/ui, LiveKit Client
├── server/           # Node.js 20 + Express + WebSocket, SQLite (better-sqlite3) + Drizzle ORM
├── shared/           # общие типы и схема Drizzle
├── src-tauri/        # Rust-обёртка Tauri v2 для Windows-сборки
├── .github/workflows # CI: автосборка .msi/.exe при пуше тега v*
├── BUILD_EXE.md      # инструкция: как получить установщик Windows
├── DEPLOY.md         # инструкция самохостинга backend (Selectel VPS)
├── docker-compose.yml
└── Dockerfile
```

## Что работает

### Веб-приложение (текущий MVP)
- Регистрация / вход, автологин через localStorage
- Серверы, голосовые + текстовые каналы, приглашения по коду
- Настройки: микрофон, вывод, шумоподавление, шорткаты, профиль
- Mobile-адаптив (одна панель за раз + bottom-tab bar)
- WebSocket-события: новые сообщения, join/leave, состояние голоса
- Голос через LiveKit (нужен подключённый LiveKit-сервер)

### Windows-клиент
- Tauri v2 обёртка вокруг веб-приложения (WebView2)
- Иконки, тёмная тема, размер окна 1280×800
- Автообновления через `tauri-plugin-updater`
- Собирается через GitHub Actions на windows-latest runner

### Backend
- Auth: bcrypt + JWT
- SQLite для хранения (better-sqlite3, миграции через Drizzle)
- REST API: `/api/auth`, `/api/servers`, `/api/channels`, `/api/messages`, `/api/voice/token`
- WebSocket на том же порту, авторизация по JWT

## Быстрый старт (локально)

Требования: Node.js 20+, npm 10+.

```bash
git clone https://github.com/<твой-логин>/egvoice.git
cd egvoice
npm install
cp .env.example .env
# минимум задай JWT_SECRET (openssl rand -hex 32)
npm run dev
```

Открывается на `http://localhost:5000`.

Для голоса локально — либо подключись к LiveKit Cloud (создай проект на https://cloud.livekit.io и укажи `LIVEKIT_*` в `.env`), либо подними LiveKit через docker-compose.

## Собрать Windows-инсталлятор (.msi + .exe)

Rust локально не нужен. Соберёт GitHub Actions.

```powershell
git tag v0.1.0
git push origin v0.1.0
```

Через 7 минут в GitHub → Releases появятся `EG-Voice_0.1.0_x64_en-US.msi` и `EG-Voice_0.1.0_x64-setup.exe`.

Подробнее (первый раз — включение прав Actions, ручной триггер) — в [BUILD_EXE.md](./BUILD_EXE.md).

## Продакшн-хостинг backend

Два варианта:

- **Быстрый:** Render.com / Railway / Fly.io — деплой из GitHub одной кнопкой + LiveKit Cloud для голоса.
- **Полный самохост:** Selectel VPS + Docker Compose + LiveKit self-hosted + Caddy для HTTPS. Пошаговая инструкция в [DEPLOY.md](./DEPLOY.md).

## Переменные окружения

| Переменная | Что это |
|---|---|
| `DOMAIN` | Основной домен приложения |
| `JWT_SECRET` | Секрет для подписи JWT (`openssl rand -hex 32`) |
| `LIVEKIT_API_KEY` | Ключ API LiveKit (Cloud или self-hosted) |
| `LIVEKIT_API_SECRET` | Секрет API LiveKit |
| `LIVEKIT_WS_URL` | Публичный WSS-URL LiveKit (`wss://...`) |
| `DATABASE_PATH` | Путь к SQLite (по умолчанию `./data/egvoice.db`) |
| `NODE_ENV` | `production` для прода |
| `PORT` | Порт HTTP-сервера (по умолчанию 5000) |

Для Windows-сборки (Tauri) дополнительно:

| Переменная | Что это |
|---|---|
| `VITE_API_URL` | URL продового backend (например `https://api.egvoice.ru`), задаётся при `npm run build` перед `tauri build` |

Полный шаблон переменных — в [.env.example](./.env.example).

## Команды разработки

```bash
npm run dev           # dev-режим (client + server, hot reload)
npm run build         # сборка client (Vite) + server (esbuild)
npm run start         # запуск собранного прода
npm run db:push       # применить схему Drizzle к SQLite
npm run tauri:dev     # локальный Tauri dev (нужен Rust)
npm run tauri:build   # локальная Tauri сборка .exe (нужен Rust + Windows)
npx tsc --noEmit      # проверка типов
```

## Лицензия

MIT — см. [LICENSE](./LICENSE).
