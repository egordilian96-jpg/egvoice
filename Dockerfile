# --- build stage ---
FROM node:20-bookworm AS build
WORKDIR /app

# Системные зависимости для better-sqlite3 (сборка native)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- runtime stage ---
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000
ENV DATA_DIR=/data

# Копируем только результат сборки и минимум для запуска
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./

VOLUME ["/data"]
EXPOSE 5000

CMD ["node", "dist/index.cjs"]
