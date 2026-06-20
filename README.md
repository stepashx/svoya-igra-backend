# Своя игра: собери презентацию проекта — бэкенд

[![CI](https://github.com/stepashx/svoya-igra-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/stepashx/svoya-igra-backend/actions/workflows/ci.yml)

Бэкенд для учебной многопользовательской real-time игры *"Своя игра: собери
презентацию проекта"*. NestJS + TypeScript, PostgreSQL + Drizzle, хранилище MinIO
(S3-совместимое), WebSocket (Socket.IO) и Swagger — REST и WebSocket
используют один процесс/URL бэкенда.

Этот репозиторий — **только бэкенд**. Фронтенда здесь нет; фронтенд является
внешним потребителем REST API, событий WebSocket и публичных URL файлов.

> **Статус — backbone игры готов.** Игра теперь проходит от начала до конца, от
> лобби до завершённого результата. Полный жизненный цикл из 12 стадий, REST-
> поверхность (13 контроллеров, доступных для просмотра в Swagger `/docs`),
> realtime-события ([docs/realtime-events.md](docs/realtime-events.md)) и слой
> данных (миграции PostgreSQL + Drizzle и статические сиды) — всё реализовано.
>
> Внутренняя документация (этот этап) завершена — этот README и набор `docs/`
> приведены в соответствие с реализованным backbone. **Ещё не сделано:**
> дальнейшее упрочнение тестов и production-аспекты (деплой, настоящая
> аутентификация, приватное хранилище) намеренно отложены на post-MVP — см.
> [Известные ограничения](#известные-ограничения) и [Дорожная карта](#дорожная-карта).

## Предварительные требования

- **Node.js 22** (LTS) и **npm** (репозиторий использует `package-lock.json`).
- **Docker** и **Docker Compose v2** (`docker compose`, а не `docker-compose`).

## Установка

Канонический локальный поток запускает бэкенд на хосте против предоставленных
Compose PostgreSQL и MinIO:

```bash
cp .env.example .env                  # дефолты локальной разработки работают сразу
docker compose up -d postgres minio   # запустить инфраструктуру
npm install                           # установить зависимости (вкл. dev-инструменты)
npm run db:migrate                    # создать схему
npm run db:seed                       # загрузить статические каталоги + создать бакет MinIO
npm run start:dev                     # запустить бэкенд с перезагрузкой
```

`db:migrate` и `db:seed` выполняются **на хосте** — они используют `drizzle-kit` /
`ts-node`, которые являются dev-зависимостями, отсутствующими в production-образе
бэкенда, поэтому не могут выполняться внутри контейнера и вместо этого
подключаются к опубликованным Compose портам `localhost`. Оба идемпотентны; см.
[docs/migrations-and-seeds.md](docs/migrations-and-seeds.md).

### Всё в Docker

Чтобы запустить бэкенд тоже в Compose, соберите и запустите полный стек, затем
примените схему и сиды с хоста (по той же причине, что и выше):

```bash
cp .env.example .env
npm run docker:up     # собрать + запустить backend, postgres, minio (в фоне)
npm install           # инструменты хоста для скриптов слоя данных
npm run db:migrate
npm run db:seed
```

Остановить всё:

```bash
npm run docker:down            # остановить и удалить контейнеры (тома с данными сохраняются)
npm run docker:reset:volumes   # также удалить данные postgres + minio (РАЗРУШИТЕЛЬНО)
```

## npm-скрипты

| Скрипт | Назначение |
|---|---|
| `npm run start:dev` | Запустить бэкенд на хосте с перезагрузкой |
| `npm run start` / `npm run start:prod` | Запустить без watch / запустить скомпилированный `dist/` |
| `npm run build` | `nest build` → `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (`--max-warnings 0`) |
| `npm test` | Юнит-тесты Jest |
| `npm run test:e2e` | Сквозные REST-тесты (нужны PostgreSQL + MinIO) |
| `npm run db:migrate` | Применить миграции к базе данных |
| `npm run db:generate` | Перегенерировать SQL миграции из схемы (офлайн) |
| `npm run db:check` | Проверить журнал миграций |
| `npm run db:seed` | Проверить + загрузить каталоги, создать бакет MinIO |
| `npm run docker:up` | Собрать образы и запустить полный стек (в фоне) |
| `npm run docker:down` | Остановить и удалить контейнеры (тома с данными сохраняются) |
| `npm run docker:logs` | Следить за логами всех сервисов |
| `npm run docker:reset:volumes` | `down -v` — удаляет контейнеры **и данные** |
| `npm run docker:config` | Проверить и вывести разрешённую конфигурацию Compose |

## Проверка стека

| Что | URL | Примечания |
|---|---|---|
| Swagger UI | http://localhost:3000/docs | OpenAPI-документ для REST-поверхности |
| Health | http://localhost:3000/api/health | JSON-отчёт (см. [Health](#health)) |
| Консоль MinIO | http://localhost:9001 | логин `minioadmin` / `minioadmin` |
| MinIO S3 API | http://localhost:9000 | используется бэкендом + публичные URL файлов |

### Swagger

`http://localhost:3000/docs` отдаёт OpenAPI-документ для REST-поверхности,
сгруппированный по восьми тегам feature-областей (Health, Game Session, Gameplay,
Commerce, Presentation, Defense, Evaluation, Realtime). Это полный
просматриваемый справочник по REST-эндпоинтам: каждый эндпоинт несёт свои
request/response DTO, общий ответ error-envelope, коды статусов 4xx для каждого
эндпоинта и file-picker на эндпоинтах загрузки.

### Health

`GET http://localhost:3000/api/health` возвращает `200`, когда каждая зависимость
доступна, и `503`, если какая-либо нет. Форма:

```json
{
  "status": "ok",
  "checks": {
    "backend": { "status": "ok" },
    "database": { "status": "ok" },
    "storage": { "status": "ok" }
  },
  "timestamp": "2026-05-31T00:00:00.000Z"
}
```

> **Проверка хранилища:** `storage` становится зелёным, как только `npm run
> db:seed` создал бакет MinIO. До этого — или если MinIO недоступен — она
> сообщает об ошибке вроде `MinIO bucket "svoya-igra" does not exist`, а общий
> статус `503`. Проба только на чтение и никогда не создаёт бакет. См.
> [docs/minio.md](docs/minio.md).

### WebSocket

REST и WebSocket (Socket.IO, путь `/socket.io`) используют один процесс и URL
бэкенда. Контракты событий — именование, payload'ы, комнаты, переподключение —
задокументированы в [docs/realtime-events.md](docs/realtime-events.md).

### PostgreSQL / MinIO

```bash
docker compose ps          # колонка STATUS показывает (healthy) для postgres и minio
docker compose logs minio  # или postgres, чтобы осмотреть конкретный сервис
```

## Архитектура

- **Clean / Hexagonal** разбиение на слои: domain (сущности, value-объекты, порты) →
  application (use-case'ы) → infrastructure (персистентность Drizzle, хранилище MinIO)
  → presentation (контроллеры, шлюзы), связанные через dependency injection NestJS.
- **NestJS** отдаёт REST и WebSocket (Socket.IO) из одного процесса; конфигурация
  валидируется один раз при старте и читается только через типизированный Config-модуль,
  никогда напрямую из `process.env`.
- **Восемь feature-областей** (теги Swagger): Health, Game Session, Gameplay,
  Commerce, Presentation, Defense, Evaluation, Realtime.
- **Жизненный цикл игры из 12 стадий:** `LOBBY → TEAM_SETUP → READY_CHECK → GAME_BOARD →
  QUESTION_OPENED → ANSWER_REVIEW → SHOP → PRESENTATION_PREPARATION →
  PRESENTATION_DEFENSE → EVALUATION → RESULTS → FINISHED`.
- **PostgreSQL + Drizzle** (16 таблиц в пяти областях схемы, одна миграция)
  для реляционного состояния; **MinIO** для байтов файлов (QR-ассеты, загрузки
  презентаций), при этом в базе данных только метаданные.

## Непрерывная интеграция

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) запускается на каждый push и
pull request в `master` (и по запросу со вкладки Actions), с тремя задачами:

- **Quality gate** — `typecheck → lint → build → test`, плюс защита от дрейфа
  схемы (`db:generate` не должен давать diff).
- **E2E** — сквозные REST-тесты против живых PostgreSQL + MinIO, после
  `db:migrate` и `db:seed`.
- **Docker (опционально)** — сборка образа только вручную, без push.

**Деплоя нет** — отложен до выбора хостинга. См.
[docs/ci.md](docs/ci.md).

## Хост против контейнера

Приложение читает всю конфигурацию через типизированный Config-модуль — никогда
напрямую из `process.env`. Два значения различаются при запуске на хосте и внутри
Compose, и `docker-compose.yml` переопределяет их автоматически для контейнера
бэкенда:

| Переменная | Хост (`.env`) | Контейнер бэкенда | Почему |
|---|---|---|---|
| `DATABASE_URL` | `...@localhost:5432/...` | `...@postgres:5432/...` | имя сервиса в сети Compose |
| `MINIO_ENDPOINT` | `localhost` | `minio` | имя сервиса в сети Compose |
| `MINIO_PUBLIC_URL` | `http://localhost:9000` | *(без изменений)* | открывает браузер, а не бэкенд |

См. [.env.example](.env.example) для полного аннотированного списка переменных и
[docs/local-development.md](docs/local-development.md) для подробностей.

## Устранение неполадок

- **`docker compose` сообщает, что переменные пустые / конфигурация выглядит пустой** —
  у вас нет `.env`. Выполните `cp .env.example .env`.
- **Порт уже занят (`3000`, `5432`, `9000`, `9001`)** — другой процесс или
  старый стек удерживает его. Остановите его или измените `PORT` / `POSTGRES_PORT` /
  `MINIO_PORT` / `MINIO_CONSOLE_PORT` в `.env`.
- **Health показывает `storage: error` (бакет не существует)** — бакет ещё не
  создан. Выполните `npm run db:seed` (см. [docs/minio.md](docs/minio.md)).
- **Эндпоинты фич выдают ошибку (например, `relation "…" does not exist`) или поле
  пустое** — схема или каталоги не загружены. Выполните `npm run db:migrate`, затем
  `npm run db:seed`.
- **Бэкенд не может достучаться до базы данных/MinIO с хоста** — запустите
  зависимости (`docker compose up -d postgres minio`) и убедитесь, что `.env` использует
  `localhost`.
- **Устаревшие данные после изменений конфигурации** — `npm run docker:reset:volumes`
  стирает тома postgres/minio для чистого старта (удаляет локальные данные); после
  заново выполните `db:migrate` и `db:seed`.
- **Пересборка после изменений зависимостей** — `docker compose up --build` (или
  `npm run docker:up`) пересобирает образ бэкенда.

## Документация

- **[docs/frontend-guide.md](docs/frontend-guide.md) — начните отсюда для сборки
  фронтенда.** Связующая модель: как сшить вместе REST, WebSocket, аутентификацию и
  машину из 12 стадий, со сквозными сценариями игры. Он ссылается на справочники
  ниже, а не дублирует их.
- [docs/demo.md](docs/demo.md) — поднять бэкенд и сыграть полную демо-игру
  от начала до конца через REST/WS (без фронтенда), чтобы показать backbone.
- [docs/realtime-events.md](docs/realtime-events.md) — подробный каталог событий
  WebSocket (имена, направления, аудитории, payload'ы).
- [docs/ws-testing.md](docs/ws-testing.md) — чеклист ручного тестирования WebSocket
  (сценарии §22 из плана, сопоставленные с реальными событиями, с шагами проверки).
- [docs/migrations-and-seeds.md](docs/migrations-and-seeds.md) — схема,
  миграции и поток сидов.
- [docs/local-development.md](docs/local-development.md) — подробный поток локальной разработки.
- [docs/minio.md](docs/minio.md) — консоль MinIO, создание бакета и
  соглашения по хранилищу.
- [docs/ci.md](docs/ci.md) — пайплайн GitHub Actions (quality gate, E2E, опциональная
  Docker-задача).

## Известные ограничения

Это **учебный MVP**, рассчитанный на одну демо-комнату игры с горсткой
участников — не закалённый production-сервис.

- **Хранилище объектов с публичным чтением.** Бакет MinIO отдаётся через обычные
  анонимные публичные URL; без presigned URL, приватных бакетов, CDN или отдачи
  с отдельного origin. Stored-XSS смягчён (загрузки получают серверно-канонический
  `Content-Type` плюс `Content-Disposition: attachment`), но бакет публичен по замыслу.
  См. [docs/minio.md](docs/minio.md#известные-ограничения).
- **Присутствие и таймеры в памяти.** Присутствие сокетов и таймеры ответа / магазина /
  презентации живут в памяти процесса, поэтому теряются при перезапуске и
  предполагают **единственный инстанс бэкенда** (без горизонтального масштабирования).
- **Учебная аутентификация.** Настоящей аутентификации нет: ведущие и игроки
  идентифицируются по токенам переподключения, `FRONTEND_ORIGIN` / `WS_CORS_ORIGIN` по
  умолчанию равны `*`, а учётные данные MinIO — общеизвестные дефолты. Закройте это
  перед любым общим или публичным окружением.
- **Деплоя нет.** Нет задач деплоя, хостинга или продвижения окружений —
  отложено до решения по хостингу.

## Дорожная карта

- **Этапы 1–10 — backbone игры.** *Готово.* Инфраструктура и конфигурация, слой
  данных (схема/миграции/сиды), лобби и настройка команд, игровое поле и боевой цикл,
  начисление очков, магазин и QR-инструменты, загрузка презентаций, защита, оценивание
  и финальные результаты — полная игра от лобби до завершения.
- **Этап 11 — документация.** *Готово.* Внутренняя документация (README и
  `docs/` приведены в соответствие с реализованным backbone), финализация Swagger
  (error-envelope, file-picker, коды статусов 4xx для каждого эндпоинта) и руководство
  по интеграции фронтенда ([docs/frontend-guide.md](docs/frontend-guide.md)).
- **Этап 12 — тестирование и упрочнение.** *Следующее.*
