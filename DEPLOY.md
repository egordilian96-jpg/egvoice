# EG Voice — деплой на Selectel (подробная инструкция)

Домен: **egvoice.ru** (зарегистрирован в Selectel)
Клиент: **Windows** (PowerShell / Windows Terminal)
Стек: 1 VPS + Docker Compose (веб + LiveKit + Caddy для HTTPS)

Итоговые адреса, которые получишь в конце:
- `https://egvoice.ru` — само приложение
- `https://livekit.egvoice.ru` — WebSocket для голоса (LiveKit)
- `turns.egvoice.ru` — TURN-сервер (UDP/TCP, без HTTPS)

---

## Шаг 0. Что должно быть под рукой

- Аккаунт **my.selectel.ru** с привязанной картой и пополнённым балансом (~500-800 ₽ хватит на месяц старта).
- Домен `egvoice.ru` уже в Selectel.
- На Windows-машине: **Windows Terminal** (или обычный PowerShell 5.1+). OpenSSH-клиент в Windows 10/11 встроен, ничего доустанавливать не нужно.

---

## Шаг 1. Генерируешь SSH-ключ на Windows

Открой **PowerShell** (Пуск → набери `PowerShell`) и выполни:

```powershell
ssh-keygen -t ed25519 -C "egvoice-selectel"
```

На вопросы отвечай:
- `Enter file in which to save the key (C:\Users\<ты>/.ssh/id_ed25519):` — **Enter** (оставляем по умолчанию)
- `Enter passphrase:` — **Enter** (пустой пароль; можешь задать свой, но тогда придётся вводить его при каждом подключении)
- `Enter same passphrase again:` — **Enter**

Появятся два файла:
- `C:\Users\<ты>\.ssh\id_ed25519` — приватный, никому не показывай
- `C:\Users\<ты>\.ssh\id_ed25519.pub` — публичный, его загрузим в Selectel

Посмотри публичный ключ и **скопируй всё содержимое** (одна длинная строка, начинается с `ssh-ed25519 AAAA...`):

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

Выдели строку мышью → `Ctrl+C`. Держи её в буфере — она пригодится в шаге 3.

---

## Шаг 2. Создаёшь проект и SSH-ключ в панели Selectel

1. Заходишь в **my.selectel.ru** → слева меню **«Облачная платформа»**.
2. Если проекта нет — сверху **«Создать проект»**:
   - **Название:** `egvoice`
   - **Регион:** любой российский, например `ru-7 (Санкт-Петербург)` или `ru-9 (Москва)` — выбери тот, что ближе географически к твоим тестерам.
   - Нажми **«Создать»**.
3. Внутри проекта → в верхнем меню раздел **«Ключи»** (или **«SSH-ключи»**, зависит от версии панели) → **«Добавить SSH-ключ»**.
   - **Название:** `windows-egor`
   - **Публичный ключ:** вставь ту строку из шага 1 (`ssh-ed25519 AAAA...`).
   - **Добавить**.

---

## Шаг 3. Создаёшь облачный сервер

В проекте `egvoice` → **«Серверы»** → **«Создать сервер»**.

Заполняешь форму сверху вниз:

| Поле | Что выбрать | Комментарий |
|---|---|---|
| **Имя сервера** | `egvoice-prod` | любое, для себя |
| **Регион и пул** | тот же, что у проекта (например `ru-9a`) | важно, чтобы совпадал |
| **Источник** → **Готовый образ** | **Ubuntu 24.04 LTS 64-bit** | LTS — с долгой поддержкой |
| **Конфигурация** → **Фиксированная** | **2 vCPU / 4 GB RAM** (тариф ~ SL1.2-4-40) | для 10 человек с запасом |
| **Загрузочный диск** | **Universal SSD, 40 GB** | 40 достаточно; можно 25 если хочешь сэкономить |
| **Сеть** | **Публичная подсеть** — оставь галку «Публичный IPv4» | без него сервер не будет доступен из интернета |
| **Приватная подсеть** | можно оставить дефолт или снять галку | не нужна |
| **Файрвол (Cloud Firewall)** | пока **не назначать** (создадим позже) | если панель требует — выбери «Разрешить всё» |
| **SSH-ключ** | выбери `windows-egor` (из шага 2) | обязательно! иначе root получит случайный пароль |
| **Резервное копирование** | по желанию, для MVP можно **отключить** | сэкономит ~20% стоимости |

Внизу увидишь стоимость (~500-700 ₽/мес).

Нажимаешь **«Создать»**. Через 30-60 секунд сервер поднимется, в списке появится **публичный IP** — запиши его, например `85.119.145.20`. Далее по инструкции будет `<IP>` — везде подставляй свой.

---

## Шаг 4. Настраиваешь DNS на egvoice.ru

Возвращаешься в **my.selectel.ru** → слева меню **«DNS»** (может называться **«DNS-хостинг»**).

Убедись, что зона `egvoice.ru` уже существует. Если нет — **«Добавить зону»** → введи `egvoice.ru` → **Добавить**.

Внутри зоны → **«Добавить запись»**. Нужно создать **четыре A-записи**:

| Тип | Имя (subdomain) | Значение (IP) | TTL |
|---|---|---|---|
| A | `@` (или оставь пустым — это корень `egvoice.ru`) | `<IP твоего сервера>` | 3600 |
| A | `www` | `<IP>` | 3600 |
| A | `livekit` | `<IP>` | 3600 |
| A | `turns` | `<IP>` | 3600 |

Как это выглядит в форме:
- **Тип записи:** выпадающий список → выбери `A`
- **Имя:** для корня — оставь поле пустым или поставь `@`; для поддомена — просто `livekit` (без `.egvoice.ru`, панель сама допишет)
- **Значение:** IP-адрес твоего сервера
- **TTL:** оставь `3600` (это 1 час)
- **Сохранить**

Повтори для всех четырёх. После сохранения проверяешь в PowerShell:

```powershell
nslookup egvoice.ru
nslookup livekit.egvoice.ru
nslookup turns.egvoice.ru
```

Должны отдавать твой IP. Обычно у Selectel-DNS обновление за 1-5 минут; если nslookup ещё показывает NXDOMAIN — подожди 10 минут.

---

## Шаг 5. Первый заход на сервер по SSH

В PowerShell:

```powershell
ssh root@<IP>
```

При первом подключении спросит:
```
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```
Отвечаешь: `yes` + Enter.

Ты внутри сервера. Промпт станет `root@egvoice-prod:~#`.

---

## Шаг 6. Настраиваешь свежий сервер

Прямо внутри SSH-сессии выполняй по одному блоку:

### 6.1. Обновления и Docker

```bash
apt update && apt upgrade -y
apt install -y ca-certificates curl gnupg ufw

# Официальный Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

docker --version
docker compose version
```

### 6.2. UFW (файрвол на самом сервере)

Открываем ровно то, что нужно:

```bash
ufw allow 22/tcp     comment 'SSH'
ufw allow 80/tcp     comment 'HTTP (Caddy для сертификатов)'
ufw allow 443/tcp    comment 'HTTPS (сайт + LiveKit WSS)'
ufw allow 3478/udp   comment 'TURN UDP'
ufw allow 3478/tcp   comment 'TURN TCP'
ufw allow 5349/tcp   comment 'TURN TLS'
ufw allow 50000:60000/udp comment 'LiveKit RTP media'

ufw --force enable
ufw status
```

### 6.3. Раскладка проекта

```bash
mkdir -p /opt/egvoice
cd /opt/egvoice
```

Теперь нужно **залить сюда содержимое папки `eg-voice/` из моего workspace**. Есть два варианта:

**Вариант A — простой (через git, если ты выложишь код на GitHub):**
```bash
apt install -y git
git clone https://github.com/<твой-логин>/eg-voice.git .
```

**Вариант B — залить прямо с Windows (без git):**
На Windows у меня выкачаешь папку `eg-voice/` (я тебе её отдам архивом), потом в **новом окне PowerShell на Windows** (не в SSH!):
```powershell
scp -r C:\путь\к\eg-voice\* root@<IP>:/opt/egvoice/
```

После этого в SSH-сессии сервера:
```bash
cd /opt/egvoice
ls
# должны увидеть: client/  server/  docker-compose.yml  Dockerfile  Caddyfile  livekit.yaml  .env.example
```

### 6.4. .env файл — заполняешь ОДИН РАЗ

```bash
cd /opt/egvoice
cp .env.example .env

# Генерируем секреты
JWT=$(openssl rand -hex 32)
LK_KEY=$(openssl rand -hex 8)
LK_SECRET=$(openssl rand -hex 32)
TURN_SECRET=$(openssl rand -hex 24)

# Записываем в .env
cat > .env <<EOF
DOMAIN=egvoice.ru
LIVEKIT_DOMAIN=livekit.egvoice.ru
TURN_DOMAIN=turns.egvoice.ru
LETSENCRYPT_EMAIL=egordilian96@gmail.com

JWT_SECRET=$JWT

LIVEKIT_API_KEY=$LK_KEY
LIVEKIT_API_SECRET=$LK_SECRET
LIVEKIT_WS_URL=wss://livekit.egvoice.ru

TURN_SECRET=$TURN_SECRET

DATABASE_PATH=/data/egvoice.db
NODE_ENV=production
PORT=5000
EOF

cat .env
```

Проверь глазами: домены совпадают с твоими, e-mail — твой (Let's Encrypt пришлёт на него алерты об истечении сертификатов).

### 6.5. Прописываем ключи LiveKit в его конфиг

```bash
# Подставим сгенерированные ключи в livekit.yaml
source .env
sed -i "s|__LIVEKIT_API_KEY__|$LIVEKIT_API_KEY|g" livekit.yaml
sed -i "s|__LIVEKIT_API_SECRET__|$LIVEKIT_API_SECRET|g" livekit.yaml
sed -i "s|__TURN_SECRET__|$TURN_SECRET|g" livekit.yaml
sed -i "s|__TURN_DOMAIN__|$TURN_DOMAIN|g" livekit.yaml

# Убедись что подставилось
head -40 livekit.yaml
```

### 6.6. Запуск

```bash
docker compose pull
docker compose build
docker compose up -d
```

Первый запуск займёт 3-5 минут (Caddy выпустит сертификаты Let's Encrypt для всех трёх доменов, LiveKit скачает образ).

Смотришь логи:
```bash
docker compose logs -f caddy
```
Должно быть что-то вроде `certificate obtained successfully` для `egvoice.ru`, `www.egvoice.ru`, `livekit.egvoice.ru`. `Ctrl+C` чтобы выйти из логов (контейнеры продолжат работать).

```bash
docker compose ps
```
Все контейнеры должны быть в статусе `Up`.

---

## Шаг 7. Проверка

В браузере на своей Windows-машине:
- Открываешь **https://egvoice.ru** — должна открыться страница логина EG Voice, замочек в адресной строке зелёный.
- Регистрируешься, создаёшь сервер, заходишь в голосовой канал, разрешаешь микрофон.
- Открываешь **второе окно в режиме инкогнито** (или на телефоне) → регистрируешься вторым аккаунтом → тестируешь голос друг с другом.

Если голос не идёт — проверь на сервере:
```bash
docker compose logs livekit --tail=100
docker compose logs egvoice --tail=100
```

---

## Шаг 8. Что делать дальше

**Ежедневная эксплуатация:**
- Логи: `docker compose logs -f`
- Рестарт: `docker compose restart`
- Обновление кода: залей новые файлы (git pull или scp) → `docker compose build && docker compose up -d`

**Бэкап базы (раз в неделю руками или через cron):**
```bash
docker compose exec -T egvoice sqlite3 /data/egvoice.db ".backup /data/backup-$(date +%F).db"
docker compose cp egvoice:/data/backup-$(date +%F).db /root/
```
И скачиваешь с Windows:
```powershell
scp root@<IP>:/root/backup-*.db C:\backups\
```

**Стоимость:**
- Сервер 2 vCPU / 4 GB / 40 GB ≈ 500-700 ₽/мес
- Публичный IP включён
- Трафик — первые сотни ГБ бесплатно, дальше копейки
- Домен `egvoice.ru` — ~200-400 ₽/год

---

## Быстрая карта на случай проблем

| Симптом | Проверить |
|---|---|
| `ssh: connection refused` | Селектеловский Cloud Firewall (в панели у сервера) — если включён, разреши TCP/22 |
| Сайт открывается по IP, но не по домену | DNS ещё не обновился (`nslookup egvoice.ru`) |
| Сертификат «недоверенный» / ERR_CERT | Caddy не смог выпустить — смотри `docker compose logs caddy`. Обычно причина — DNS ещё не обновился или закрыт 80/tcp |
| Логин работает, но голос — тишина | `docker compose logs livekit` + проверь что 3478/udp и 50000-60000/udp реально открыты (`ufw status`) |
| Всё сломалось после обновления | `docker compose down && docker compose up -d` |

Всё, готово. По любому шагу — пиши, где застрял, дам микрокоманды под твою ошибку.
