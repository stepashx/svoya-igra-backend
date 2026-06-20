# Локальная разработка

Подробное дополнение к [README](../README.md). Описывает топологию Compose,
переменные окружения, два режима запуска и очистку.

## Предварительные требования

- Node.js 22 (LTS) + npm.
- Docker + Docker Compose v2 (`docker compose ...`).

## Топология Compose

`docker-compose.yml` определяет три сервиса в общей bridge-сети
(`svoya-igra`) с постоянными именованными томами:

| Сервис | Образ | Порты хоста | Том | Health check |
|---|---|---|---|---|
| `backend` | собирается из `Dockerfile` | `3000` | — | liveness-проба GET `/api/health` |
| `postgres` | `postgres:16-alpine` | `5432` | `pgdata` | `pg_isready` |
| `minio` | `minio/minio:RELEASE.2025-09-07T16-13-09Z` | `9000` (API), `9001` (консоль) | `miniodata` | `GET /minio/health/live` |

Бэкенд запускается только после того, как `postgres` и `minio` сообщат о
работоспособности (`depends_on: condition: service_healthy`). Его собственный
health check — это проба **liveness**: любой HTTP-ответ считается признаком
жизни, поэтому контейнер выглядит работоспособным, даже когда `/api/health`
сообщает о деградации `storage`, что и происходит, пока `npm run db:seed` не
создаст бакет (см. [migrations-and-seeds.md](migrations-and-seeds.md)).

Данные сохраняются после `docker compose down`; они удаляются только командой
`docker compose down -v` (`npm run docker:reset:volumes`).

## Переменные окружения

Вся конфигурация проходит через типизированный модуль Config (`src/config`) и
валидируется один раз при старте — приложение отказывается запускаться при
отсутствующих или некорректных значениях, и ничто не читает `process.env`
напрямую. Скопируйте `.env.example` в `.env` и поправьте значения.

Значения по умолчанию предназначены только для локальной разработки. Две
переменные зависят от окружения, и `docker-compose.yml` переопределяет их для
бэкенда внутри Compose:

| Переменная | Значение на хосте | В бэкенде внутри Compose | Причина |
|---|---|---|---|
| `DATABASE_URL` | `...@localhost:5432/...` | `...@postgres:5432/...` | доступ к БД по имени сервиса |
| `MINIO_ENDPOINT` | `localhost` | `minio` | доступ к MinIO по имени сервиса |
| `MINIO_PUBLIC_URL` | `http://localhost:9000` | без изменений | ссылка для браузера |

`POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` инициализируют контейнер
postgres и питают переопределённый `DATABASE_URL` бэкенда; держите их
согласованными с `DATABASE_URL` на хосте. `MINIO_ACCESS_KEY` /
`MINIO_SECRET_KEY` одновременно служат root-учётными данными MinIO.

`NODE_ENV` равно `development` для режима запуска на хосте, но
`docker-compose.yml` устанавливает `NODE_ENV=production` для бэкенда внутри
Compose, чтобы оно соответствовало рантайм-образу (который собран только с
production-зависимостями). Образ MinIO зафиксирован на датированном теге
`RELEASE.*` для воспроизводимых локальных сборок.

## Режим запуска A — всё в Docker

```bash
cp .env.example .env
npm run docker:up      # docker compose up --build -d (backend + postgres + minio)
npm install            # инструментарий на хосте для скриптов слоя данных
npm run db:migrate     # применить схему (хост → localhost)
npm run db:seed        # засеять каталоги + создать бакет MinIO (хост → localhost)
docker compose ps      # postgres и minio должны быть (healthy)
npm run docker:logs    # следить за логами (Ctrl-C — прекратить слежение)
```

`db:migrate` / `db:seed` выполняются **на хосте** против опубликованных Compose
портов `localhost` — их нельзя запустить внутри контейнера бэкенда, чей образ
содержит только production-зависимости (без `drizzle-kit` / `ts-node`). См.
[migrations-and-seeds.md](migrations-and-seeds.md).

## Режим запуска B — бэкенд на хосте, инфраструктура в Docker

Лучший вариант для итеративной работы над кодом бэкенда с перезагрузкой:

```bash
cp .env.example .env
docker compose up -d postgres minio
npm install
npm run db:migrate     # применить схему
npm run db:seed        # засеять каталоги + создать бакет MinIO
npm run start:dev
```

Хостовый `.env` уже нацелен на `localhost`, поэтому переопределения не нужны.
`db:migrate` / `db:seed` выполняются один раз на свежий стек (и идемпотентны при
повторном запуске); см. [migrations-and-seeds.md](migrations-and-seeds.md).

## Проверка

- Swagger: http://localhost:3000/docs
- Health: `curl -s http://localhost:3000/api/health` (200 = всё доступно; 503 =
  зависимость недоступна или — до `db:seed` — отсутствует бакет MinIO; см.
  [minio.md](minio.md)).
- Консоль MinIO: http://localhost:9001 (`minioadmin` / `minioadmin`).
- Работоспособность сервисов: `docker compose ps`.

## Поднятие Compose — проверено

Режим запуска A, описанный выше, был прогнан от начала до конца на
`feature/stage-12` (2026-06-17, Docker 27.4 / Compose v2.31, Docker Desktop на
macOS). Что было подтверждено:

1. **`docker compose config` валиден** (код выхода 0). Переопределения бэкенда
   разворачиваются как задумано — `DATABASE_URL=…@postgres:5432`,
   `MINIO_ENDPOINT=minio`, `NODE_ENV=production` — а `MINIO_PUBLIC_URL` остаётся
   хостовым URL.
2. **`docker compose up -d --build` поднимает стек в порядке зависимостей.**
   `postgres` и `minio` запускаются и первыми становятся `(healthy)`, затем — по
   условию `depends_on: condition: service_healthy` — запускается `backend`. Все
   три сообщают `(healthy)` в `docker compose ps`.
3. **Бэкенд загружается и обслуживает запросы.** Логи показывают `Nest
   application successfully started` / `Backend listening on port 3000 (prefix:
   /api)`, всю отображённую REST-поверхность (69 маршрутов) и подписку
   Socket.IO-gateway на `client:realtime:join-room` / `leave-room`. Handshake
   engine.io по `/socket.io/` возвращает идентификатор сессии, так что транспорт
   WebSocket работает на опубликованном порту (чеклист realtime см. в
   [ws-testing.md](ws-testing.md)).
4. **Схема + сиды применяются с хоста** (образ содержит только
   production-зависимости — без `drizzle-kit` / `ts-node`): `npm run db:migrate`,
   затем `npm run db:seed` против опубликованных Compose портов `localhost`. Сид
   создал бакет MinIO, загрузил placeholder-SVG для QR и выполнил upsert
   каталогов — идемпотентно при повторном запуске.
5. **Запущенный стек отвечает.** `GET /api/health` → `200` (`database` +
   `storage` оба `ok`); `GET /api/topics` возвращает четыре засеянные темы
   (контейнер читает засеянную БД от начала до конца).
6. **`docker compose down` чисто сворачивает стек** — контейнеры и сеть
   удаляются; тома `pgdata` / `miniodata` сохраняются (для их очистки используйте
   `npm run docker:reset:volumes`).

**Рабочий порядок / нюансы:**

- **Миграция и сид выполняются на хосте, а не в контейнере** (шаг 4). В образе
  нет инструментария слоя данных, поэтому он никогда не мигрирует и не засеивает
  себя сам. На *свежем* стеке (после `docker compose down -v`) `GET /api/health`
  сообщает `storage: error`, пока `db:seed` не создаст бакет (см.
  [minio.md](minio.md)); именованные тома сохраняют данные через обычный `down`,
  поэтому последующее повторное поднятие сразу зелёное без повторного засеивания.
- **Свежая сборка `--build` требует доступа к реестру** для подтягивания базового
  образа `node:22-alpine`; CI-задание `docker build` это прогоняет (см.
  [ci.md](ci.md)). Если сборка прерывается на подтягивании базового образа
  (временная ошибка реестра/сети), повторите подтягивание —
  `docker pull node:22-alpine` — и заново запустите `docker compose up -d --build`.
  Уже собранный образ `svoya-igra-backend-backend` переиспользуется без
  пересборки (`docker compose up -d` без `--build`).

## Остановка и очистка

```bash
npm run docker:down            # остановить и удалить контейнеры, сохранить данные
npm run docker:reset:volumes   # ещё и удалить pgdata + miniodata (РАЗРУШИТЕЛЬНО)
docker compose build backend   # пересобрать образ после изменения зависимостей
```

## Что где выполняется

- **Схема и сиды** — `npm run db:migrate`, затем `npm run db:seed`, запускаются
  на хосте (инструментарий слоя данных предназначен только для разработки и
  отсутствует в образе бэкенда). См. [migrations-and-seeds.md](migrations-and-seeds.md).
- **CI** — см. [`ci.yml`](../.github/workflows/ci.yml) и [ci.md](ci.md):
  контроль качества (typecheck → lint → build → test → дрейф схемы) плюс
  REST-задание сквозного тестирования против живых PostgreSQL + MinIO.
- **REST и WebSocket** — основа игры реализована (lobby → finished).
  REST-поверхность можно просматривать в Swagger `/docs`; контракты realtime-
  событий находятся в [realtime-events.md](realtime-events.md), а чеклист ручного
  тестирования WebSocket — в [ws-testing.md](ws-testing.md).
- **Развёртывание** — не здесь: отложено до выбора хостинга (см.
  [README → Известные ограничения](../README.md#известные-ограничения)).
