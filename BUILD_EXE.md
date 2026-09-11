# Как получить .exe (первая сборка через GitHub Actions)

Rust на твоей машине **не нужен**. GitHub соберёт всё в облаке.

## Один раз в жизни

### 1. Залей код на GitHub

Если ещё нет репозитория:
```powershell
cd C:\dev\egvoice
git remote add origin https://github.com/<твой-логин>/egvoice.git
git add -A
git commit -m "add tauri wrapper + ci"
git push -u origin main
```

Если репозиторий уже был — просто `git add -A && git commit && git push`.

### 2. Проверь что Actions включены

Открой `https://github.com/<твой-логин>/egvoice/settings/actions`
- **Actions permissions:** «Allow all actions»
- **Workflow permissions:** «Read and write permissions» (это важно — иначе CI не сможет создать Release)
- **Save**

## Каждый раз, когда хочешь новую версию

### Способ A — через тег (рекомендуется)

```powershell
cd C:\dev\egvoice
git tag v0.1.0
git push origin v0.1.0
```

Через 5-8 минут в GitHub → **Releases** появится:
- `EG-Voice_0.1.0_x64_en-US.msi` (~8 МБ) — инсталлятор
- `EG-Voice_0.1.0_x64-setup.exe` — альтернативный NSIS-инсталлятор
- `latest.json` — для авто-обновлений

Ссылка «Скачать для Windows» на лендинге автоматически подхватит его.

### Способ B — руками из веба

`https://github.com/<твой-логин>/egvoice/actions` → «Build EG Voice — Windows» → **Run workflow** → **Run**.

Соберёт .msi без создания релиза (артефакт будет доступен на странице workflow-run).

## Что происходит внутри

Workflow `.github/workflows/build-tauri.yml`:
1. Windows-раннер GitHub (виртуалка) поднимается за минуту
2. Ставит Node.js 20 + Rust stable
3. `npm ci` → `npm run build` → собирает фронт в `dist/public`
4. `tauri build` → компилирует Rust-обёртку + пакует всё в .msi
5. Создаёт GitHub Release с прикреплёнными файлами

Первая сборка ~7 минут (нужно скачать Rust crates). Последующие — ~4 минуты за счёт кэша.

## Если что-то пошло не так

- **Workflow не запустился при `git push origin v0.1.0`** — проверь Settings → Actions → включены ли workflows.
- **Cannot create release: 403** — Settings → Actions → General → **Workflow permissions** → «Read and write permissions».
- **Rust compilation error** — открой лог, чаще всего это временный сбой сети; жми «Re-run failed jobs».
- **MSI собрался, но не запускается на моём Win** — Windows Defender может ругаться на «неизвестного издателя» (нет цифровой подписи). Нажми «Подробнее» → «Выполнить в любом случае». Это норма для MVP; в проде подпишем через сертификат.

## Что дальше

После первой удачной сборки:
1. Скачиваешь .msi со страницы Releases
2. Устанавливаешь у себя (двойной клик → Далее → Готово)
3. В меню Пуск ищи «EG Voice» — запустится нативное окно
4. Внутри — тот же UI, что в веб-версии, но с настоящими системными правами (микрофон, буфер обмена, автозапуск)

Обновления — просто пуш нового тега `v0.1.1`; авто-апдейтер сам подтянет.
