# Непрерывная интеграция (GitHub Actions)

Пайплайн определён в
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml). Это **quality gate**
проекта для backend: каждый push и pull request прогоняет те же проверки, что
разработчик запускает локально, плюс end-to-end-набор против настоящих
PostgreSQL и MinIO. Деплоя намеренно **нет** — см.
[Отложено](#отложено).

В workflow три job:

- **`build`** — обязательный quality gate (typecheck · lint · build · unit-тесты
  · защита от schema-drift). Без сервисов.
- **`e2e`** — REST end-to-end-тесты против живых PostgreSQL + MinIO.
- **`docker`** — опциональная, только ручная сборка образа.

## Триггеры

Workflow запускается по:

- **push** в `master`;
- **pull_request** в `master`;
- **workflow_dispatch** — ручной запуск со вкладки **Actions** репозитория.

Запуски группируются по ref через `cancel-in-progress`, поэтому push более
свежего коммита в ту же ветку/PR отменяет выполняющийся запуск. Токен workflow
работает только на чтение (`permissions: contents: read`).

## Job контроля качества (`build`)

Обязательный job `build` выполняется на `ubuntu-latest` и запускает те же
npm-скрипты, что и локально, по порядку:

| Шаг | Команда | Проверки |
|---|---|---|
| Checkout | `actions/checkout@v4` | Получить репозиторий |
| Setup Node | `actions/setup-node@v4` | Node из [`.nvmrc`](../.nvmrc), кэш npm |
| Install | `npm ci --prefer-offline --no-audit --no-fund` | Воспроизводимая установка из lockfile |
| Typecheck | `npm run typecheck` | TypeScript компилируется без ошибок |
| Lint | `npm run lint` | ESLint проходит (`--max-warnings 0`, без авто-исправлений) |
| Build | `npm run build` | `nest build` создаёт `dist/` |
| Test | `npm test` | Unit-тесты Jest проходят |
| Schema drift | `npm run db:generate` | Миграции совпадают со схемой Drizzle (падает при любом diff) |

`npm ci` **падает, если `package.json` и `package-lock.json` рассинхронизированы**,
поэтому шаг установки заодно проверяет lockfile. Node закреплён через `.nvmrc`
(Node 22) с помощью `node-version-file` у `setup-node`, что совпадает с целевой
версией проекта и `Dockerfile`; `setup-node` также кэширует каталог загрузок npm
с ключом по lockfile, поэтому установки остаются быстрыми между запусками.

Шаг **schema-drift** заново генерирует SQL из TypeScript-схемы и падает, если
что-либо под `migrations/` меняется — это означало бы, что закоммиченная
миграция разошлась со схемой и должна быть перегенерирована (`npm run db:generate`
и коммит). Он выполняется **офлайн**: `db:generate` не подключается, поэтому
фиктивного `DATABASE_URL` достаточно, чтобы пройти разбор конфигурации. См.
[migrations-and-seeds.md](migrations-and-seeds.md).

### Никаких живых сервисов в этом job

Тесты quality gate — **unit-уровня и с моками** — им не нужны живые PostgreSQL
или MinIO, поэтому job `build` не запускает **никаких сервисов**. Проверки,
опирающиеся на базу данных и хранилище, выполняются в отдельном job `e2e` ниже.

## E2E-job (`e2e`)

Job `e2e` запускает REST end-to-end-набор (`npm run test:e2e`) против **настоящих
PostgreSQL и MinIO**, прогоняя полный путь через схему и хранилище.

**PostgreSQL** работает как **service container** GitHub Actions (`postgres:16`,
БД `svoya_igra`, пользователь/пароль `postgres`/`postgres`, порт `5432`) с
health-check `pg_isready`, поэтому job продолжается только после того, как база
начинает принимать соединения.

**MinIO** работает как **шаг** (`docker run … minio/minio:RELEASE.2025-09-07… server
/data`), а не как service container. Причина: service container не может
переопределить команду своего образа, а `minio/minio` без команды просто печатает
справку и завершается — поэтому MinIO запускается шагом, где можно передать
`server /data` (повторяя `docker-compose.yml`). Его root-учётные данные берутся из
`MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` job, чтобы root-пользователь сервера был
равен ключам, которыми аутентифицируются приложение и сид. Следующий шаг опрашивает
`/minio/health/live`, пока MinIO не будет готов.

Блок `env` job направляет приложение и скрипты слоя данных на эти сервисы
(`DATABASE_URL` → `localhost:5432`, `MINIO_ENDPOINT=localhost`,
`MINIO_PORT=9000`, бакет `svoya-igra`, path-style). Затем шаги выполняются по
порядку:

| Шаг | Команда | Что делает |
|---|---|---|
| Apply migrations | `npm run db:migrate` | Создать схему в сервисном PostgreSQL |
| Seed catalogs (and MinIO bucket) | `npm run db:seed` | Проверить каталоги, подготовить бакет + QR SVG, выполнить upsert каталогов |
| E2E tests | `npm run test:e2e` | Прогнать REST end-to-end-набор |

Это тот же хостовый поток `db:migrate` → `db:seed`, который разработчики запускают
локально (см. [migrations-and-seeds.md](migrations-and-seeds.md)) — CI доказывает,
что он работает от начала до конца на чистой машине.

## Опциональный Docker-job (`docker`)

Job `docker` проверяет, что образ backend всё ещё собирается из `Dockerfile`.
Он:

- запускается **только** при ручном `workflow_dispatch`
  (`if: github.event_name == 'workflow_dispatch'`), никогда на push или pull
  request;
- помечен `continue-on-error: true`, поэтому никогда не блокирует результат
  workflow;
- выполняет `docker build -t svoya-igra-backend:ci .` и **никогда не пушит** образ
  в какой-либо реестр.

Если проверка образа вам не нужна, просто игнорируйте этот job — quality gate и
job e2e являются гейтами, которые запускаются на каждый push и PR.

## Отложено

- **Деплой** — нет job-ов деплоя, продвижения окружений, пушей в реестр или
  скриптов под конкретный хостинг. Деплой отложен до решения по хостингу
  (открытые вопросы master-контекста 6–7).
