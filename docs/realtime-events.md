# Контракт realtime-событий

Транспорт: WebSocket (Socket.IO), разделяющий единый backend-процесс/URL с
REST. Базовый gateway (`src/realtime/realtime.gateway.ts`) — **только
транспорт**: он группирует сокеты по комнате и рассылает события, опубликованные
через `RealtimeEventsPort`. Бизнес-логики в нём нет, состояние игры он не валидирует.

Этот документ — единственное место, где перечислены realtime-события. Вся
поверхность **живая**: события действительно эмитируются по восьми областям функциональности
ниже (§16.1–§16.8), payload каждого задокументирован. Базовый gateway остаётся
только транспортом; идентичность сокета, переподключение и аудитории host/team
наслаиваются game-session gateway и use-case'ами приложения (см.
§5.2a / §5.2b и колонку Status каждой области).

## Соглашение об именовании

Имена событий учитывают направление и привязаны к области:

- `server:<area>:<event>` — рассылка server → client
- `client:<area>:<command>` — команда client → server

`<area>` соответствует компактной области функциональности (`game-session`, `gameplay`,
`commerce`, `presentation`, `evaluation`, `realtime`). Имена строятся через
`realtimeEventName(direction, area, name)` из
`src/realtime/realtime-events.constants.ts`.

## Аудитория

Аудитория — это вопрос **публикации**, а не часть имени события. Событие
доставляется нужным получателям эмиссией в соответствующую группу сокетов:

- **room-wide** — всем в комнате: каждый сокет, присоединённый к группе комнаты
- **host-only** — только ведущему: сокет(ы) ведущего
- **team-only** — только команде: сокеты одной команды
- **captain-only** — только капитану: сокет капитана
- **originating socket** — только отправителю: единственный исходный сокет (например, снимок или
  ошибка, возвращаемая вызывающему)

## Команды транспортного уровня (определены сейчас)

| Событие | Направление | Назначение |
|---|---|---|
| `client:realtime:join-room` | client → server | Присоединить сокет к группе комнаты. Только транспортная группировка — без валидации членства. |
| `client:realtime:leave-room` | client → server | Покинуть группу комнаты. |

## Переподключение

Токен переподключения может быть передан на handshake (`auth.reconnectToken` или
query). `GameSessionGateway` разрешает его — сначала игрок, затем ведущий — присоединяет
сокет к его комнате, запускает use-case `ReconnectClient` и возвращает
`connection-restored` + снимок `room-state` исходному сокету.
Отсутствующий/пустой токен оставляет сокет анонимным (обслуживается только базовым gateway);
непустой токен, который не удаётся разрешить, получает один `error`, затем принудительное
отключение. Полный пошаговый разбор — в _Поток переподключения (handshake)_ под
§5.2b.

## События функциональности

Восемь каталогов ниже покрывают всю поверхность: общие Game Session (§16.1),
Lobby (§16.2), старт игры (§16.3), Gameplay (§16.4), Commerce (§16.5),
Presentation (§16.6), Defense (§16.7) и Evaluation (§16.8).

**Имена, аудитории и payload'ы.** Каждый каталог фиксирует каноническое имя,
направление, область и аудиторию каждого события. Payload'ы тоже задокументированы — формы
§16.1–§16.3 под §5.2a / §5.2b, а формы §16.4–§16.8 — inline в колонке Status каждой
области. Аудитория — это вопрос публикации (см. раздел Audience
выше), показана построчно.

### Game Session — серверные рассылки (§16.1 Общие)

| Каноническое имя | Направление | Область | Аудитория | Назначение | Ссылка на план |
|---|---|---|---|---|---|
| `server:game-session:room-state` | server | game-session | originating socket | Снимок room-state при подключении/переподключении | §16.1 |
| `server:game-session:room-closed` | server | game-session | room | Комната закрыта (status→CLOSED) | §16.1 |
| `server:realtime:error` | server | realtime | originating socket | Транспортная ошибка при обработке команды/состояния | §16.1 |
| `server:game-session:error` | server | game-session | originating socket | Доменный отказ лобби (например, имя занято, комната полна) | §16.1 |
| `server:game-session:client-reconnected` | server | game-session | room | Игрок восстановил идентичность; connection_status→CONNECTED | §16.1 |
| `server:game-session:host-reconnected` | server | game-session | room | Ведущий восстановил идентичность и управление | §16.1 |
| `server:realtime:connection-lost` | server | realtime | room | Сокет участника отвалился; помечен DISCONNECTED | §16.1 |
| `server:realtime:connection-restored` | server | realtime | originating socket | Сокет восстановлен; запускает снимок room-state | §16.1 |

### Game Session — серверные рассылки (§16.2 Лобби)

| Каноническое имя | Направление | Область | Аудитория | Назначение | Ссылка на план |
|---|---|---|---|---|---|
| `server:game-session:player-joined` | server | game-session | room | Игрок вошёл в комнату | §16.2 |
| `server:game-session:player-left` | server | game-session | room | Игрок покинул комнату | §16.2 |
| `server:game-session:player-profile-updated` | server | game-session | room | Игрок сменил имя/аватар | §16.2 |
| `server:game-session:team-created` | server | game-session | room | Команда создана; первая команда → стадия TEAM_SETUP | §16.2 |
| `server:game-session:team-joined` | server | game-session | room | Игрок вошёл в команду | §16.2 |
| `server:game-session:team-updated` | server | game-session | room | Изменились атрибуты команды (имя/капитан/состав) | §16.2 |
| `server:game-session:team-topic-selected` | server | game-session | room | Команда выбрала тему (teams.selectedTopicId, уникальна в комнате) | §16.2 |
| `server:game-session:team-ready-changed` | server | game-session | room | teams.isReady переключён; при ≥ MIN_TEAMS_TO_START готовых → стадия READY_CHECK | §16.2 |
| `server:game-session:game-can-start-changed` | server | game-session | room | Флаг «ведущий может стартовать»: число команд с is_ready=true пересекает MIN_TEAMS_TO_START. Цель каталога — ведущий; сейчас эмитируется **всем в комнате** (`MarkTeamReadyUseCase.emitToRoom`), сужение до аудитории ведущего отложено (§5.2b omissions) — не-host клиенты могут его игнорировать | §16.2 |

### Game Session — серверные рассылки (§16.3 Старт игры)

| Каноническое имя | Направление | Область | Аудитория | Назначение | Ссылка на план |
|---|---|---|---|---|---|
| `server:game-session:game-started` | server | game-session | room | Ведущий стартовал игру; стадия→GAME_BOARD; backend назначает первую команду, случайный turn_order, случайные темы командам, которые не выбрали | §16.3 |
| `server:game-session:game-first-team-selected` | server | game-session | room | Первая команда выбрана случайно (rooms.currentTeamId) | §16.3 |
| `server:game-session:game-stage-changed` | server | game-session | room | Переход rooms.currentStage (LOBBY→TEAM_SETUP→READY_CHECK→GAME_BOARD) | §16.3 |
| `server:game-session:game-turn-changed` | server | game-session | room | Сменилась активная команда (turn_order). Общее для §16.3 и §16.4 — в gameplay не дублируется | §16.3 |
| `server:game-session:game-state-updated` | server | game-session | room | Широкий дельта-снимок состояния игры (вкл. автоназначенные темы на старте) | §16.3 |

### Game Session — клиентские команды

Входящие команды, область `game-session`. Аудитория к командам не применяется;
применяется авторизация отправителя. **Emits** перечисляет результирующие рассылки
`server:game-session:*` по их короткому имени. Payload'ы — Этап 5.2.

| Каноническое имя | Направление | Область | Назначение | Emits | Отправитель |
|---|---|---|---|---|---|
| `client:game-session:create-team` | client | game-session | Создать команду | `team-created` (+ `game-stage-changed` на первой) | player/captain |
| `client:game-session:join-team` | client | game-session | Войти в команду | `team-joined`, `team-updated` | player |
| `client:game-session:leave-team` | client | game-session | Покинуть команду | `team-updated` | player |
| `client:game-session:update-profile` | client | game-session | Сменить имя/аватар | `player-profile-updated` | player |
| `client:game-session:select-topic` | client | game-session | Выбрать тему | `team-topic-selected` | captain |
| `client:game-session:set-ready` | client | game-session | Переключить готовность | `team-ready-changed`, `game-can-start-changed` | captain |
| `client:game-session:start-game` | client | game-session | Стартовать игру | `game-started`, `game-first-team-selected`, `game-stage-changed`, `game-turn-changed` | host |

### Имя плана → каноническое имя (§16.1–16.3)

Канонические имена выводятся механически из токенов плана: токен плана
`x:y` становится `<direction>:<area>:x-y` в kebab-case, сохраняя исходные
токены (camelCase разбивается по регистру, например `profileUpdated` → `profile-updated`).
Голый `error` (без `:`) отображается в транспортную область как `server:realtime:error`.
Область назначается по принадлежности: домен session/lobby → `game-session`; чистый
транспорт (ошибки, жизненный цикл соединения) → `realtime`.

| Имя плана (§16) | Каноническое имя |
|---|---|
| `room:state` | `server:game-session:room-state` |
| `room:closed` | `server:game-session:room-closed` |
| `error` | `server:realtime:error` |
| `client:reconnected` | `server:game-session:client-reconnected` |
| `host:reconnected` | `server:game-session:host-reconnected` |
| `connection:lost` | `server:realtime:connection-lost` |
| `connection:restored` | `server:realtime:connection-restored` |
| `player:joined` | `server:game-session:player-joined` |
| `player:left` | `server:game-session:player-left` |
| `player:profileUpdated` | `server:game-session:player-profile-updated` |
| `team:created` | `server:game-session:team-created` |
| `team:joined` | `server:game-session:team-joined` |
| `team:updated` | `server:game-session:team-updated` |
| `team:topicSelected` | `server:game-session:team-topic-selected` |
| `team:readyChanged` | `server:game-session:team-ready-changed` |
| `game:canStartChanged` | `server:game-session:game-can-start-changed` |
| `game:started` | `server:game-session:game-started` |
| `game:firstTeamSelected` | `server:game-session:game-first-team-selected` |
| `game:stageChanged` | `server:game-session:game-stage-changed` |
| `game:turnChanged` | `server:game-session:game-turn-changed` |
| `game:stateUpdated` | `server:game-session:game-state-updated` |

§16.1 `error` также порождает доменный вариант `server:game-session:error`
(отказы лобби, такие как name-taken / room-full). У него нет отдельного токена
плана — он уточняет единственный план `error` на транспорт против домена.

### Комнаты и членство: REST vs. транспорт

- **CreateRoom / JoinRoom — это REST**, а не WS-команды (§15.1 Rooms API, §15.2
  Players API). Они выдают идентичность и токен переподключения; никакая
  команда `client:game-session:*` не создаёт и не подключает к комнате.
- Транспортные команды `client:realtime:join-room` /
  `client:realtime:leave-room` уже существуют в
  `realtime-events.constants.ts`. Они лишь присоединяют/отсоединяют сокет к каналу
  комнаты — это **не** членство в комнате.

### Gameplay — серверные рассылки (§16.4)

Каталог рассылок §16.4 «поле и вопросы», эмитируемых боевыми use-case'ами
game-session с под-этапа 6.2 (6.2a подключил room-wide строки; 6.2b — две
host-строки). Колонка **Status** фиксирует диспозицию каждого имени **и его
payload**. Аудитория — это вопрос публикации (см. раздел Audience выше),
показана построчно. В payload'ах фигурируют две общие проекции:

- **BoardCell** = `{ id, categoryId, points, position, state, openedByTeamId, answeredByTeamId }`
- **RoomQuestion** = `{ id, categoryId, points, position, text }` — **без `correctAnswer`**

Об ограничениях секретности и таймера см. _Заметки по контракту Gameplay_ ниже.

| Каноническое имя | Направление | Область | Аудитория | Назначение | Ссылка на план | Status |
|---|---|---|---|---|---|---|
| `server:gameplay:board-state-updated` | server | gameplay | room | Грубый снимок поля (6×5, категории, номиналы, занятые ячейки) | §16.4 | Эмитируется с 6.2a из RejectSelection / ReviewAnswer (снимок поля после хода); payload `{ roomId, cells: BoardCell[] }` |
| `server:gameplay:cell-selected` | server | gameplay | room | Выбор ячейки капитаном (room-wide подсветка ожидания) | §16.4 | **Вытеснено** cell-selection-requested — имя зарезервировано, константа не определена, НИКОГДА не эмитируется |
| `server:gameplay:cell-selection-requested` | server | gameplay | host | Капитан активной команды запросил ячейку; ведущему предлагается одобрить/отклонить | §16.4 | Эмитируется с 6.2b из SelectQuestionUseCase (капитан `POST board/select`), аудитория host через `HostRealtimeEventsPort`; payload `{ roomId, cell: BoardCell }` |
| `server:gameplay:cell-selection-approved` | server | gameplay | room | Ведущий одобрил → переход GAME_BOARD → QUESTION_OPENED | §16.4 | Эмитируется с 6.2a из OpenQuestionUseCase (ведущий `POST questions/open`); payload `{ roomId, cell: BoardCell }` |
| `server:gameplay:cell-selection-rejected` | server | gameplay | room | Ведущий отклонил → остаётся в GAME_BOARD, капитан перевыбирает | §16.4 | Эмитируется с 6.2a из RejectSelectionUseCase (ведущий `POST questions/reject`); payload `{ roomId, cell: BoardCell }` (за ним следует `board-state-updated`) |
| `server:gameplay:question-opened` | server | gameplay | room | Вопрос раскрыт (текст/номинал/категория) — БЕЗ correctAnswer | §16.4 | Эмитируется с 6.2a из OpenQuestionUseCase; payload `{ roomId, cellId, question: RoomQuestion }` — `question` несёт **без `correctAnswer`** |
| `server:gameplay:question-timer-started` | server | gameplay | room | Запущен таймер ответа; несёт endsAt (клиент отсчитывает локально) | §16.4 | Эмитируется с 6.2a из OpenQuestionUseCase; payload `{ roomId, cellId, startedAt, endsAt }` (Date → ISO-строки в проводе) |
| `server:gameplay:question-timer-ended` | server | gameplay | room | Таймер ответа истёк (ленивая проверка ClockPort, без серверного планировщика) → QUESTION_OPENED → ANSWER_REVIEW | §16.4 | Эмитируется с 6.2a из AdvanceOnTimeoutUseCase (ведущий `POST game/advance` timeout-мост); payload `{ roomId, cellId: string \| null }` |
| `server:gameplay:answer-submitted` | server | gameplay | room | Команда отправила ответ — НЕСЁТ текст ответа всем в комнате | §16.4 | Эмитируется с 6.2a из SubmitAnswerUseCase (капитан `POST questions/answer`), **всем в комнате**; payload `{ roomId, cellId, teamId, answer: string \| null }` — ТЕКСТ `answer` рассылается всей комнате (НЕ персистится; живое эхо) |
| `server:gameplay:answer-accepted` | server | gameplay | room | Ведущий принял ответ — итог разбора, НЕ начисление | §16.4 | Эмитируется с 6.2a из ReviewAnswerUseCase (ведущий `POST questions/review`) при принятии; payload `{ roomId, cellId, teamId: string \| null }` (`teamId` = открывающая команда) |
| `server:gameplay:answer-rejected` | server | gameplay | room | Ведущий отклонил ответ — итог разбора, НЕ начисление | §16.4 | Эмитируется с 6.2a из ReviewAnswerUseCase при отклонении; ТА ЖЕ позиция/форма эмиссии, что у `answer-accepted` (флаг принятия выбирает имя); payload `{ roomId, cellId, teamId: string \| null }` |
| `server:gameplay:question-correct-answer-shown-to-host` | server | gameplay | host | Правильный ответ показан ТОЛЬКО ведущему после ответа команды | §16.4 | Эмитируется с 6.2b из ReviewAnswerUseCase **только при `revealAnswer: true`**, аудитория host; payload `{ roomId, cellId, correctAnswer }` — никогда в room-wide payload (Этап2 §8) |
| `server:gameplay:cell-blocked` | server | gameplay | room | Ячейка заблокирована (как при правильных, так и при неправильных ответах) | §16.4 | Эмитируется с 6.2a из ReviewAnswerUseCase (оба исхода); payload `{ roomId, cellId, state, answeredByTeamId: string \| null }` (`state` = BLOCKED; `answeredByTeamId` null при отклонении) |
| `server:gameplay:score-changed` | server | gameplay | room | Изменились очки команды | §16.4 | Эмитируется с 7.1 из ReviewAnswerUseCase (принятый разбор, ПОЛОЖИТЕЛЬНАЯ `delta`); ТАКЖЕ с 8.3 из PurchaseItemUseCase при списании в магазине, ОТРИЦАТЕЛЬНАЯ `delta` (двигается только `balance`, `earnedScore` держится); payload `{ roomId, teamId, earnedScore, balance, delta }` |
| `server:game-session:game-turn-changed` | server | game-session | room | Сменилась активная команда | §16.4 → см. game-session | Общее §16.3/§16.4 — в gameplay не дублируется (эмитируется StartGame в 5.2a и MoveToNextTurn в 6.2) |

### Gameplay — клиентские команды (§16.4)

Входящие команды, область `gameplay`. Аудитория к командам не применяется;
применяется авторизация отправителя. **Emits** перечисляет результирующие рассылки по их короткому
имени; payload'ы — Этап 6.2. Эти строки — **forward-path** — не подключены в
Этапе 6; живые команды работают через REST (§15.5–15.7). См. _Gameplay contract
notes_ ниже.

| Каноническое имя | Направление | Область | Назначение | Emits | Отправитель |
|---|---|---|---|---|---|
| `client:gameplay:select-cell` | client | gameplay | Капитан выбирает ячейку (SelectQuestion) | `cell-selection-requested` | captain (активная команда) |
| `client:gameplay:approve-selection` | client | gameplay | Ведущий одобряет (OpenQuestion) | `cell-selection-approved`, `question-opened`, `question-timer-started` | host |
| `client:gameplay:reject-selection` | client | gameplay | Ведущий отклоняет выбор | `cell-selection-rejected` | host |
| `client:gameplay:submit-answer` | client | gameplay | Команда отправляет ответ (SubmitAnswer) | `answer-submitted` | captain/team |
| `client:gameplay:review-answer` | client | gameplay | Ведущий принимает/отклоняет (ReviewAnswer) | `answer-accepted` \| `answer-rejected`, `score-changed` (при принятии), `cell-blocked`, `game-turn-changed` | host |
| `client:gameplay:reveal-correct-answer` | client | gameplay | Ведущий запрашивает правильный ответ (§14.6 опционально) | `question-correct-answer-shown-to-host` | host |

### Имя плана → каноническое имя (§16.4)

Тот же вывод, что в §16.1–16.3: токен плана `x:y` становится `server:gameplay:x-y`
в kebab-case (camelCase разбивается по регистру, например `stateUpdated` → `state-updated`,
`correctAnswerShownToHost` → `correct-answer-shown-to-host`). Два токена
особые: `cell:selected` зарезервирован/вытеснен (см. выше), а `game:turnChanged`
сохраняет своё существующее имя `game-session` — общее для §16.3/§16.4, не второе имя.

| Имя плана (§16.4) | Каноническое имя |
|---|---|
| `board:stateUpdated` | `server:gameplay:board-state-updated` |
| `cell:selected` | `server:gameplay:cell-selected` (reserved — superseded by `cell:selectionRequested`, not emitted in Stage 6) |
| `cell:selectionRequested` | `server:gameplay:cell-selection-requested` |
| `cell:selectionApproved` | `server:gameplay:cell-selection-approved` |
| `cell:selectionRejected` | `server:gameplay:cell-selection-rejected` |
| `question:opened` | `server:gameplay:question-opened` |
| `question:timerStarted` | `server:gameplay:question-timer-started` |
| `question:timerEnded` | `server:gameplay:question-timer-ended` |
| `answer:submitted` | `server:gameplay:answer-submitted` |
| `answer:accepted` | `server:gameplay:answer-accepted` |
| `answer:rejected` | `server:gameplay:answer-rejected` |
| `question:correctAnswerShownToHost` | `server:gameplay:question-correct-answer-shown-to-host` |
| `cell:blocked` | `server:gameplay:cell-blocked` |
| `score:changed` | `server:gameplay:score-changed` |
| `game:turnChanged` | `server:game-session:game-turn-changed` (see game-session; shared §16.3/§16.4 — not a second name) |

### Заметки по контракту Gameplay (§16.4)

- **Payload'ы и эмиссия живые с Этапа 6.2** (6.2a подключил room-wide
  строки; 6.2b — две host-строки). Payload каждого события — в колонке Status
  выше; общие проекции `BoardCell` / `RoomQuestion` определены во вступлении этого
  раздела. Room-wide payload'ы никогда не несут `correctAnswer`.
- **Секретность, зафиксирована сейчас.** `question-opened` уходит **всем в комнате без
  `correctAnswer`**; правильный ответ достигает ведущего **только** через
  `question-correct-answer-shown-to-host` (аудитория host) и никогда не рассылается
  игрокам (Этап 2 §8).
- **Таймер несёт `endsAt`.** `question-timer-started` несёт `endsAt`;
  таймер хранится как `startedAt` / `endsAt` / `status`, клиент отсчитывает
  локально, а истечение — это **ленивая проверка `ClockPort`** без серверного планировщика.
- **Мутации боевого цикла — REST.** Реальные мутации работают через REST
  (§15.5–15.7 — SelectQuestion / OpenQuestion / SubmitAnswer / ReviewAnswer);
  входящие команды `client:gameplay:*` выше — это запланированный WS forward-path и
  не реализованы в Этапе 6, ровно как `client:game-session:*` остался
  forward-path в Этапе 5.0.

### Commerce — серверные рассылки (§16.5)

Каталог рассылок §16.5 «магазин и инвентарь». Константы лежат в
`src/game-session/application/events/commerce-events.ts` (рядом с
use-case'ами game-session, которые их эмитируют, Design A). Тройка жизненного цикла магазина —
`shop-opened`, `shop-final-opened`, `shop-closed` — **эмитируется с
под-этапа 8.2** (ReviewAnswerUseCase открывает магазин, CloseShopUseCase закрывает
его); цепочка покупки — `shop-state-updated`, `shop-item-purchased`,
`shop-item-unavailable` (room) и `inventory-updated` (team) — **эмитируется
с под-этапа 8.3** (PurchaseItemUseCase). `shop-purchase-rejected`
**вытеснено** (только REST 409; эмиттер капитана не построен). Колонка **Status**
фиксирует диспозицию каждого имени. Аудитория — это вопрос публикации (см.
раздел Audience выше), показана построчно. Об ограничении приватности, действующем
повсеместно, см. _Заметки по контракту Commerce_ ниже.

| Каноническое имя | Направление | Область | Аудитория | Назначение | Ссылка на план | Status |
|---|---|---|---|---|---|---|
| `server:commerce:shop-opened` | server | commerce | room | Магазин открыт (ANSWER_REVIEW → SHOP, каденция каждого 6-го вопроса) | §16.5 | Эмитируется с 8.2 из ReviewAnswerUseCase (триггер магазина) |
| `server:commerce:shop-final-opened` | server | commerce | room | Открыт финальный магазин (поле исчерпано, перед презентациями) | §16.5 | Эмитируется с 8.2 из ReviewAnswerUseCase (триггер магазина, исчерпанное поле) |
| `server:commerce:shop-state-updated` | server | commerce | room | Грубый снимок магазина (каталог + состояние покупок) — БЕЗ publicUrl/QR-содержимого | §16.5 | Эмитируется с 8.3 из PurchaseItemUseCase; payload `{ roomId, items: [{ id, title, description, price, qrToolId, available }] }` (in-tx, ПОСЛЕДНИМ в блоке room) |
| `server:commerce:shop-item-purchased` | server | commerce | room | Команда купила товар (товар + покупающая команда; снимок цены) — БЕЗ publicUrl/QR-содержимого | §16.5 | Эмитируется с 8.3 из PurchaseItemUseCase; payload `{ roomId, teamId, shopItemId, price, purchasedAt }` |
| `server:commerce:shop-item-unavailable` | server | commerce | room | Товар стал недоступен (куплен другой командой, §14.8) | §16.5 | Эмитируется с 8.3 из PurchaseItemUseCase; payload `{ roomId, shopItemId }` |
| `server:commerce:shop-purchase-rejected` | server | commerce | captain | Покупка капитана отклонена (недостаточно баланса / уже куплено) | §16.5 | **Вытеснено** — только REST: отказ — это ответ с ошибкой POST-purchase 409 (эмиттер сокета капитана не построен) |
| `server:commerce:inventory-updated` | server | commerce | team | В инвентарь команды добавился купленный QR-инструмент (publicUrl разрешён ЗДЕСЬ — аудитория team) | §16.5 | Эмитируется с 8.3 из PurchaseItemUseCase, аудитория team, ПОСЛЕ commit; payload `{ roomId, teamId, inventoryItem: { id, shopItemId, qrToolId, addedAt }, qrTool: { id, title, description, fileFormat, publicUrl } }` |
| `server:commerce:shop-closed` | server | commerce | room | Магазин закрыт (действие ведущего или таймер магазина) → обратно в GAME_BOARD или дальше к презентациям | §16.5 | Эмитируется с 8.2 из CloseShopUseCase |

### Commerce — клиентские команды (§16.5)

Входящие команды, область `commerce`. **Только forward-path** — не подключены в Этапе
8; живые мутации работают через REST (§15.8 purchase/close), ровно как
команды gameplay и game-session оставались forward-path в своих этапах.

| Каноническое имя | Направление | Область | Назначение | Emits | Отправитель |
|---|---|---|---|---|---|
| `client:commerce:purchase-item` | client | commerce | Капитан покупает товар магазина (Purchase) | `shop-item-purchased`, `shop-item-unavailable`, `shop-state-updated`, `inventory-updated` \| `shop-purchase-rejected` | captain |
| `client:commerce:close-shop` | client | commerce | Ведущий закрывает магазин (CloseShop) | `shop-closed` | host |

### Имя плана → каноническое имя (§16.5)

Тот же вывод, что в §16.1–16.4: токен плана `x:y` становится `server:commerce:x-y`
в kebab-case (camelCase разбивается по регистру, например `finalOpened` → `final-opened`,
`itemPurchased` → `item-purchased`).

| Имя плана (§16.5) | Каноническое имя |
|---|---|
| `shop:opened` | `server:commerce:shop-opened` |
| `shop:finalOpened` | `server:commerce:shop-final-opened` |
| `shop:stateUpdated` | `server:commerce:shop-state-updated` |
| `shop:itemPurchased` | `server:commerce:shop-item-purchased` |
| `shop:itemUnavailable` | `server:commerce:shop-item-unavailable` |
| `shop:purchaseRejected` | `server:commerce:shop-purchase-rejected` |
| `inventory:updated` | `server:commerce:inventory-updated` |
| `shop:closed` | `server:commerce:shop-closed` |

### Заметки по контракту Commerce (§16.5)

- **Вся поверхность §16.5 живая с 8.3.** Под-этап 8.1 зафиксировал контракт имя /
  направление / область / аудитория; 8.2 подключил жизненный цикл — `shop-opened`
  / `shop-final-opened` срабатывают room-wide ПОСЛЕДНИМИ в блоке рассылки ReviewAnswerUseCase
  (payload `{roomId, currentShopRound, startedAt, endsAt, minClosableAt}`),
  а `shop-closed` срабатывает из CloseShopUseCase (payload
  `{roomId, currentShopRound, nextStage}`). Под-этап 8.3 подключает цепочку
  покупки в PurchaseItemUseCase: room-wide `score-changed` (отрицательная delta) →
  `shop-item-purchased` → `shop-item-unavailable` → `shop-state-updated` срабатывают
  В транзакции; затем `inventory-updated` с аудиторией team срабатывает ПОСЛЕ commit
  (см. заметку о приватности ниже). `shop-purchase-rejected` не построен —
  отказ капитана — это ответ POST-purchase 409.
- **Приватность QR, зафиксирована сейчас.** QR-инструмент принадлежит покупающей команде. Room-wide
  payload'ы — в частности `shop-item-purchased` и `shop-state-updated` —
  НИКОГДА не должны нести `publicUrl` или любое QR-содержимое; инструмент достигает владельцев
  только через `inventory-updated` с аудиторией team и через team-gated
  REST-чтения инвентаря (§15.9). Утечка QR в комнату вручила бы каждой команде
  купленное преимущество (прецедент секретности `correctAnswer` из §16.4).
- **«Unavailable» — это состояние покупки, а не доступность по средствам.** `shop-item-unavailable` —
  это room-global состояние покупки (§14.8: товар уникален на игру).
  Доступность по средствам вычисляется на стороне клиента из балансов команд (Этап 2 §10) —
  сервер не рассылает доступность по средствам по командам.
- **`inventory-updated` эмитируется ПОСЛЕ коммита транзакции покупки.**
  Это единственное намеренное исключение из правила «эмитировать внутри транзакции»: это
  единственный payload, несущий QR `publicUrl`, так что если бы он был отправлен в транзакции,
  а COMMIT затем провалился, команда держала бы QR для откатившейся покупки.
  Room-wide события остаются в транзакции (их риск отката — это устаревшее
  состояние покупки, а не утёкший секрет). Веерная рассылка команде читает из in-memory
  объектов и проглатывает собственные сбои, так что не может прервать закоммиченную покупку.
- **Доставка команде теперь существует; отказ капитана остаётся только REST.** Этап
  8.3 добавил `TeamRealtimeEventsPort` и `PresenceTeamRealtimeEventsAdapter`
  (host-паттерн 6.2b, зеркально): он разрешает состав команды из репозитория
  игроков и веером рассылает живым сокетам каждого участника через
  `LobbyPresenceRegistry.socketsForPlayer('p:<playerId>')`. Эмиттер капитана
  не построен — `shop-purchase-rejected` вытеснено ответом POST-purchase 409.
- **Переподключение инвентаря — это guarded REST-чтение.** Переподключающийся клиент перечитывает
  `GET rooms/:code/inventory/teams/:teamId[/qr-tools]` (прецедент переподключения GET-board),
  огороженное `TeamMemberOrHostGuard` (участники команды или ведущий).
  `publicUrl` разрешён на этих чтениях — огороженный своими владельцами — но никогда в
  room-wide payload.
- **§19 уникальность QR-предмета транзитивна — без явного индекса (решение G).**
  Уникальный индекс плана `inventory_items (room_id, qr_tool_id)` намеренно
  НЕ добавлен в 8.3. Дубликат `(room, qrTool)` невозможен транзитивно:
  `purchases (room_id, shop_item_id)` — UNIQUE, shop↔QR — 1:1, а единственный
  `inventory.create` живёт внутри той же транзакции покупки, огороженной этим
  уникальным индексом. Так что `db:generate` остаётся «No schema changes». (Если будущий этап
  расцепит товары магазина и QR-инструменты, пересмотреть и добавить индекс.)
- **Перепрыгивание между командами во время SHOP — известный риск MVP (решение L).** `Join`/`Leave`
  team не огорожены по стадии, так что во время SHOP не-капитан мог бы перейти в другую
  команду через прямой API, прочитать её инвентарь/QR и вернуться обратно.
  `TeamMemberOrHostGuard` корректен для членства, которое он видит; исправление —
  огораживание Join/LeaveTeam стадией LOBBY — отслеживается как отдельная задача Этапа 5
  и намеренно вне scope 8.3.

### Presentation — серверные рассылки (§16.6)

Каталог рассылок §16.6 «подготовка презентации». Константы лежат
в `src/game-session/application/events/presentation-events.ts` (рядом с
use-case'ами game-session, которые их эмитируют, Design A). Под-этап 9.1 зафиксировал контракт имя /
направление / область / аудитория только (без эмиссии); под-этап 9.2 подключил
пару подготовки (`preparation-started` + `timer-started` из
`StartPresentationPreparationUseCase`); **под-этап 9.3 завершает цепочку** —
`submission-uploaded` / `submission-replaced`, `submission-late` и
`files-updated` срабатывают из `UploadPresentationUseCase`. Колонка **Status**
фиксирует диспозицию каждого имени. Каждая строка — **room-wide** (о том, почему здесь нет секретности,
см. _Заметки по контракту Presentation_).

| Каноническое имя | Направление | Область | Аудитория | Назначение | Ссылка на план | Status |
|---|---|---|---|---|---|---|
| `server:presentation:preparation-started` | server | presentation | room | Подготовка открыта (комната уже в PRESENTATION_PREPARATION) | §16.6 | Эмитируется с 9.2 из StartPresentationPreparationUseCase (ведущий `POST start-preparation`), ПЕРВЫМ в паре; payload `{ roomId, stage }` (`stage` = PRESENTATION_PREPARATION) |
| `server:presentation:requirements-updated` | server | presentation | room | Каталог требований показан/обновлён для подготовки | §16.6 | Зарезервировано — каталог требований статичен (управляется сидом): читается через `GET requirements`, никогда не пушится (эмиттер не планируется) |
| `server:presentation:timer-started` | server | presentation | room | Запущен таймер подготовки (установлен deadline/endsAt) | §16.6 | Эмитируется с 9.2 из StartPresentationPreparationUseCase, сразу ПОСЛЕ `preparation-started`; payload `{ roomId, startedAt, endsAt }`. Повторный старт ЗАМЕНЯЕТ таймер и переэмитирует оба |
| `server:presentation:timer-ended` | server | presentation | room | Таймер подготовки истёк | §16.6 | Зарезервировано — серверного планировщика нет; ИСТЁКШИЙ deadline проявляется лениво через `GET deadline` (прецедент таймера ответа из §16.4), никогда не пушится |
| `server:presentation:submission-uploaded` | server | presentation | room | Команда загрузила файл своей презентации (publicUrl разрешён — файл публичный) | §16.6 | Эмитируется с 9.3 из UploadPresentationUseCase (капитан `POST upload`), ПОСЛЕ commit, ПЕРВЫМ в цепочке; payload `{ roomId, teamId, submission: { id, originalFileName, mimeType, fileSize, status, isLate, uploadedAt, publicUrl } }`. `mimeType` — это СЕРВЕРНО-каноничный MIME из расширения (никогда не клиентский тип, B2) |
| `server:presentation:submission-replaced` | server | presentation | room | Команда заменила файл своей презентации | §16.6 | Эмитируется с 9.3 из UploadPresentationUseCase (капитан `PUT upload`, или `POST` поверх существующей строки — ОДИН upsert use-case), ПОСЛЕ commit; ТОТ ЖЕ payload, что у `submission-uploaded`. id submission и storage key ПЕРЕИСПОЛЬЗУЮТСЯ (перезапись на месте; повторные загрузки с тем же расширением не оставляют сирот) |
| `server:presentation:submission-late` | server | presentation | room | Загрузка пришла после deadline (status LATE, применяется late penalty) | §16.6 | Эмитируется с 9.3 из UploadPresentationUseCase ПОСЛЕ commit, ТОЛЬКО когда загрузка была поздней (`isLate`); payload `{ roomId, teamId, submissionId, latePenalty }`. `latePenalty` = ЭФФЕКТИВНЫЙ штраф (сконфигурированный `LATE_PENALTY`, по умолчанию 1; см. заметку) |
| `server:presentation:submission-status-changed` | server | presentation | room | Сменился статус загрузки (учёт UPLOADED ⟷ LATE) | §16.6 | **Вытеснено** (никогда не эмитируется) — статус фиксируется один раз при создании, а замена — это новое создание, так что перехода UPLOADED⟷LATE для анонса нет. Константа сохранена для каталога §16.6, ровно как неэмитируемый `shop-purchase-rejected` (§16.5) |
| `server:presentation:files-updated` | server | presentation | room | Сменился список файлов презентаций комнаты (публичные ссылки) | §16.6 | Эмитируется с 9.3 из UploadPresentationUseCase ПОСЛЕ commit, ПОСЛЕДНИМ в цепочке; payload `{ roomId, files: [{ teamId, originalFileName, mimeType, fileSize, publicUrl, status, isLate, uploadedAt }] }` — весь каталог комнаты, ТА ЖЕ проекция, что у `GET files` |

### Имя плана → каноническое имя (§16.6)

Тот же вывод, что в §16.1–16.5: токен плана `x:y` становится
`server:presentation:x-y` в kebab-case (camelCase разбивается по регистру, например
`preparationStarted` → `preparation-started`, `submissionStatusChanged` →
`submission-status-changed`).

| Имя плана (§16.6) | Каноническое имя |
|---|---|
| `presentation:preparationStarted` | `server:presentation:preparation-started` |
| `presentation:requirementsUpdated` | `server:presentation:requirements-updated` |
| `presentation:timerStarted` | `server:presentation:timer-started` |
| `presentation:timerEnded` | `server:presentation:timer-ended` |
| `presentation:submissionUploaded` | `server:presentation:submission-uploaded` |
| `presentation:submissionReplaced` | `server:presentation:submission-replaced` |
| `presentation:submissionLate` | `server:presentation:submission-late` |
| `presentation:submissionStatusChanged` | `server:presentation:submission-status-changed` |
| `presentation:filesUpdated` | `server:presentation:files-updated` |

### Заметки по контракту Presentation (§16.6)

- **Файлы презентаций ПУБЛИЧНЫ — намеренная ПРОТИВОПОЛОЖНОСТЬ секретности QR из
  §16.5.** Согласно Этап2 §10.15, загруженный файл команды виден ведущему И
  другим командам. Так что payload'ы презентации МОГУТ нести `publicUrl` файла
  всем в комнате, каждое из девяти событий имеет аудиторию room, и **прятать
  нечего**. Поэтому под-этап 9.3 НЕ применяет к этим событиям team-gating в стиле
  R3 из §16.5 — этот gating существует только для сохранения секрета купленного QR,
  а у публичного файла презентации такого секрета нет. Не копируйте сюда по
  инерции паттерн приватности commerce.
- **Команд клиента нет.** Поверхности команд `client:presentation:*` нет.
  Загрузка и замена — это REST multipart-вызовы (§15.10, под-этап 9.3); ведущий
  запускает таймер подготовки по REST — `POST rooms/:code/presentation/start-preparation`
  (HostAuthGuard, 200), REST-триггер для пары §16.6 (под-этап 9.2). Рассылки выше —
  единственный транспорт презентации, только server → client.
- **9.2 эмитирует пару подготовки; 9.3 — цепочку submission/files.** Под-этап
  9.1 поставил скелет (read-модели, факт submission, два репозитория,
  экспортированные порты, реальный `GET requirements`) и не эмитировал
  ничего. Под-этап 9.2 подключает `preparation-started`, затем `timer-started` из
  `StartPresentationPreparationUseCase` (room-wide, публично, В транзакции) и
  публичные чтения `GET deadline` / `GET submissions`. Комната УЖЕ в
  PRESENTATION_PREPARATION (закрытие финального магазина в 8.2 припарковало её там), так что — в отличие от
  CloseShop — use-case НЕ меняет состояние комнаты (нет мутатора Room, нет
  `rooms.update`, STAGE_FLOW нетронут: выход в PRESENTATION_DEFENSE приходит в
  Этапе 10). Повторный старт ЗАМЕНЯЕТ in-memory таймер свежими отметками и
  переэмитирует оба (клиенты ресинкаются, без ошибки). 9.3 подключает рассылки
  submission/files (ровно как 8.1 → 8.2/8.3 для commerce).
- **Цепочка загрузки 9.3 — порядок и тайминг.** `UploadPresentationUseCase` — это
  ДВУХФАЗНЫЙ upsert: байты стримятся в MinIO ВНЕ транзакции/лока (так что
  загрузка 25 MB никогда не держит пуловое соединение — recon M1), затем короткая
  залоченная транзакция персистит строку. Рассылки срабатывают ПОСЛЕ commit (они
  несут `publicUrl` уже-долговечной строки, прецедент `inventory-updated` из 8.3),
  в фиксированном порядке: `submission-uploaded` ИЛИ `submission-replaced`
  первыми, затем `submission-late` (если загрузка была поздней), затем `files-updated`
  ПОСЛЕДНИМ. Все room-wide и публичны; team-gated канала здесь нет.
- **Хранимый MIME — серверно-каноничный, не клиентский тип (B2).** Персистируемый
  `mimeType` (и `Content-Type` ответа, плюс `Content-Disposition:
  attachment`) выводится из РАСШИРЕНИЯ файла — bucket с публичным чтением не должен
  никогда отдавать `.pdf`, полный HTML, как `text/html`. Storage key аналогично
  использует только токен расширения из allowlist, никогда сырое имя файла (C).
- **`LATE_PENALTY` равен 1 (env), а не 2 из плана.** Оператор оставил умолчание
  `.env` `LATE_PENALTY=1`; поэтому `submission-late.latePenalty` и персистируемый
  ЭФФЕКТИВНЫЙ штраф несут 1 при опоздании, 0 вовремя. Этап 10 применяет
  `max(0, rawScore − latePenalty)`.
- **`submission-status-changed` Вытеснено.** Статус решается один раз при
  создании (UPLOADED против LATE), а замена — это новое создание — перехода
  статуса на месте нет, так что у события нет триггера. Константа остаётся в
  каталоге, как неэмитируемый `shop-purchase-rejected`.
- **Сироты / отдельный origin — долги Этапа 11 (MVP).** Смена расширения файла
  при замене оставляет старый объект позади (у порта нет `delete`);
  а публичный bucket разделяет origin API, так что guard вложения `Content-Disposition` —
  а не отдельный asset-хост — это то, что сейчас нейтрализует хранимый XSS.
  Оба — принятые компромиссы MVP, закаливаются в Этапе 11.
- **Таймер подготовки in-memory, без планировщика.** Как таймеры ответа (§16.4)
  и магазина (§16.5), deadline — это ленивое сравнение `ClockPort` в
  `PresentationTimerRegistry`: `GET deadline` возвращает RUNNING/EXPIRED/IDLE
  относительно `now`, а `timer-ended` никогда не пушится (чтение EXPIRED — это
  сигнал). Колонки в БД нет; состояние не переживает рестарт процесса (single-node
  MVP). `requirements-updated` аналогично никогда не пушится — каталог статичен.

### Defense — серверные рассылки (§16.7)

Каталог рассылок §16.7 «защита презентации». Константы лежат в
`src/game-session/application/events/defense-events.ts` (рядом с use-case'ами
game-session, которые их эмитируют, Design A — ровно как commerce/presentation);
отдельного модуля defense нет. **Под-этап 10.1 эмитирует все пять** — StartDefense
открывает защиты, FinishPresentation / SkipPresenter продвигают очередь. Колонка
**Status** фиксирует диспозицию каждого имени. Каждая строка **room-wide и
ПУБЛИЧНА** (о том, почему здесь нет секретности, см. _Заметки по контракту Defense_).

| Каноническое имя | Направление | Область | Аудитория | Назначение | Ссылка на план | Status |
|---|---|---|---|---|---|---|
| `server:defense:started` | server | defense | room | Защиты открыты (PRESENTATION_PREPARATION → PRESENTATION_DEFENSE) — несёт весь порядок презентаций | §16.7 | Эмитируется с 10.1 из StartDefenseUseCase (ведущий `POST start`), ПЕРВЫМ в стартовой паре; payload `{ roomId, order }` (`order` = team ids, `turnOrder` по возрастанию) |
| `server:defense:team-started` | server | defense | room | Следующий выступающий вышел | §16.7 | Эмитируется с 10.1 из StartDefenseUseCase (первый выступающий, сразу ПОСЛЕ `started`) и из Finish/Skip (каждый последующий выступающий); payload `{ roomId, teamId }` |
| `server:defense:team-finished` | server | defense | room | Защита текущего выступающего завершена | §16.7 | Эмитируется с 10.1 из FinishPresentationUseCase (ведущий `POST finish-presenter`), ПЕРВЫМ в продвижении; payload `{ roomId, teamId }` (выступающий, который только что ушёл) |
| `server:defense:team-skipped` | server | defense | room | Ведущий пропустил текущего выступающего | §16.7 | Эмитируется с 10.1 из SkipPresenterUseCase (ведущий `POST skip-presenter`), ПЕРВЫМ в продвижении; payload `{ roomId, teamId }`. ЕДИНСТВЕННОЕ отличие от `team-finished` — в остальном то же продвижение |
| `server:defense:finished` | server | defense | room | ПОСЛЕДНИЙ выступающий завершил/пропущен (PRESENTATION_DEFENSE → EVALUATION) | §16.7 | Эмитируется с 10.1 из Finish/Skip, когда следующего выступающего нет (конец конечной очереди), вместо `team-started`; payload `{ roomId, nextStage }` (`nextStage` = EVALUATION) |

### Имя плана → каноническое имя (§16.7)

Тот же вывод, что в §16.1–16.6: токен плана `x:y` становится `server:defense:x-y`
в kebab-case (camelCase разбивается по регистру, например `teamStarted` → `team-started`).

| Имя плана (§16.7) | Каноническое имя |
|---|---|
| `defense:started` | `server:defense:started` |
| `defense:teamStarted` | `server:defense:team-started` |
| `defense:teamFinished` | `server:defense:team-finished` |
| `defense:teamSkipped` | `server:defense:team-skipped` |
| `defense:finished` | `server:defense:finished` |

### Заметки по контракту Defense (§16.7)

- **Состояние защиты полностью ДЕРИВАЦИОННО — таблицы defense нет.** Текущий
  выступающий — это `Room.currentTeamId` (тот же указатель, что использует боевой ход),
  а порядок — это `turnOrder` участвующих команд по возрастанию (назначен на старте
  игры, §14.5). 10.1 НЕ добавляет схему, НЕ добавляет in-memory реестр — состояние
  живёт в существующих колонках и поэтому переживает рестарт процесса
  (`db:generate` остаётся «No schema changes»). Публичный `GET defense/state`
  пересчитывает его по запросу для переподключения/обновления.
- **Очередь КОНЕЧНА — без зацикливания (ключевой контраст с боевым ходом).** Боевой
  ход — это round-robin, который зацикливается через `% length` (review-answer
  `moveToNextTurn`); очередь защиты — НЕТ. `nextDefensePresenter` возвращает
  `order[idx + 1] ?? null`, так что за последним выступающим следующей команды нет —
  и именно этот `null` управляет рассылкой `finished` и
  выходом PRESENTATION_DEFENSE → EVALUATION.
- **StartDefense ДВИГАЕТ стадию (как CloseShop, в отличие от старта подготовки в 9.2).**
  Комната припаркована в PRESENTATION_PREPARATION после подготовки/загрузки;
  StartDefense валидирует эту стадию, `transitionTo('PRESENTATION_DEFENSE')`,
  наводит комнату на первого выступающего и персистит через `rooms.update` — два
  новых ребра STAGE_FLOW (PRESENTATION_PREPARATION → PRESENTATION_DEFENSE →
  EVALUATION). `start-preparation` из 9.2 не менял состояние комнаты; этот — меняет.
- **Темп задаёт ведущий, без таймера.** В отличие от таймеров ответа (§16.4), магазина (§16.5) и
  подготовки (§16.6), таймера/реестра defense НЕТ — ведущий задаёт
  темп через `finish-presenter` / `skip-presenter`. Нет `ClockPort`, нет
  планировщика, нет deadline.
- **Всё публично, room-wide, без команд клиента.** Порядок и прогресс защиты
  ничего не скрывают (намеренная противоположность секретности QR из §16.5), так что каждое событие
  имеет аудиторию room с публичным payload, и 10.1 не применяет team-gating. Поверхности
  `client:defense:*` нет: три мутации — это REST-действия ведущего —
  `POST rooms/:code/defense/{start,finish-presenter,skip-presenter}` (HostAuthGuard,
  200) — а `GET rooms/:code/defense/state` — это открытое чтение.
- **Порядок эмиссии фиксирован.** Старт: `started` (порядок), затем `team-started`
  (первый выступающий). Каждое продвижение: `team-finished` / `team-skipped` (уходящий
  выступающий) первым, затем либо `team-started` (следующий выступающий), либо —
  на последнем — `finished` (`nextStage` = EVALUATION). EVALUATION припаркована
  до Этапа 10.2; рёбра `EVALUATION → RESULTS → FINISHED` приходят с 10.3.

### Evaluation — серверные рассылки (§16.8)

Каталог рассылок §16.8 «сбор оценивания». Константы лежат в
`src/game-session/application/events/evaluation-events.ts` (рядом с
use-case'ами game-session, которые их эмитируют, Design A — ровно как
commerce/presentation/defense); сам модуль evaluation не эмитирует ничего.
**Под-этап 10.2 эмитирует все три** — SubmitEvaluation записывает оценку,
ConfirmEvaluation замораживает её. Каждая строка **room-wide**, и — определяющее
правило здесь — **НЕ несёт числовой оценки** (§16.8 «интрига»: текущие подсчёты
держатся в секрете до результатов, 10.3). Колонка **Status** фиксирует диспозицию
каждого имени.

| Каноническое имя | Направление | Область | Аудитория | Назначение | Ссылка на план | Status |
|---|---|---|---|---|---|---|
| `server:evaluation:score-submitted` | server | evaluation | room | Капитан/ведущий отправил (или переотправил) одну оценку | §16.8 | Эмитируется с 10.2 из SubmitEvaluationUseCase (капитан `POST team` / ведущий `POST host`), ПЕРВЫМ в паре отправки; payload `{ roomId, targetTeamId, evaluatorType, evaluatorTeamId, created }` — **без числовой оценки** (`evaluatorTeamId` null для ведущего) |
| `server:evaluation:score-confirmed` | server | evaluation | room | Капитан/ведущий подтвердил (заморозил) одну оценку | §16.8 | Эмитируется с 10.2 из ConfirmEvaluationUseCase (`POST team/confirm` / `POST host/confirm`), ПЕРВЫМ в группе подтверждения — по одному на замороженную строку (per-target: ровно одна; all-at-once: по одной на каждый оставшийся черновик); payload `{ roomId, targetTeamId, evaluatorType, evaluatorTeamId }` — **без числовой оценки** |
| `server:evaluation:progress-updated` | server | evaluation | room | Текущий подсчёт изменился | §16.8 | Эмитируется с 10.2 из Submit (всегда) и Confirm (только когда что-то было заморожено), ПОСЛЕ события(й) оценки; payload `{ roomId, team, host, totalExpected, complete }`, где `team`/`host` — это `{ submitted, confirmed, expected }` — **только счётчики** |
| `server:evaluation:completed` | server | evaluation | room | Игра завершена (RESULTS, FINISHED) | §16.8 | Эмитируется с 10.3 из CalculateResultsUseCase (ведущий `POST results`) ПОСЛЕ коммита транзакции, ПЕРВЫМ в паре результатов; payload `{ roomId, stage, status }` (stage RESULTS, status FINISHED) |
| `server:evaluation:results-calculated` | server | evaluation | room | Финальная таблица лидеров | §14.10 | Эмитируется с 10.3 из CalculateResultsUseCase ПОСЛЕ commit, сразу после `completed`; payload `{ roomId, leaderboard }`, где каждая запись — это `{ teamId, teamName, earnedScore, presentationScoreRaw, latePenalty, presentationScoreFinal, finalScore, place }` — ПУБЛИЧНЫЕ АГРЕГАТЫ (отдельные `evaluation_scores` остаются приватными) |
| `server:evaluation:results-shown` | server | evaluation | room | UI-сигнал показать результаты | §16.8 | **Зарезервировано** — сигнал слоя представления без серверного триггера; таблица лидеров поставляется через `results-calculated` / `GET results` |

### Имя плана → каноническое имя (§16.8)

Тот же вывод, что в §16.1–16.7: токен плана `x:y` становится `server:evaluation:x-y`
в kebab-case (camelCase разбивается по регистру, например `scoreSubmitted` → `score-submitted`).

| Имя плана (§16.8) | Каноническое имя |
|---|---|
| `evaluation:scoreSubmitted` | `server:evaluation:score-submitted` |
| `evaluation:scoreConfirmed` | `server:evaluation:score-confirmed` |
| `evaluation:progressUpdated` | `server:evaluation:progress-updated` |
| `evaluation:completed` | `server:evaluation:completed` |
| `evaluation:resultsCalculated` | `server:evaluation:results-calculated` |

### Заметки по контракту Evaluation (§16.8)

- **Числа ПРИВАТНЫ до результатов (§16.8 «интрига»).** Ни одна рассылка и
  ни один payload прогресса не несёт числовой оценки — только id, флаг `created` и
  счётчики `{ submitted, confirmed, expected }`. СОБСТВЕННЫЕ числа автора
  возвращаются исключительно в его REST-ответе (`POST team`/`host` эхом отдаёт отправленный
  `EvaluationScore`); поверхности GET для оценок другого оценивающего намеренно НЕТ
  до Этапа 10.3. `GET rooms/:code/evaluation/progress` — только счётчики.
- **Нет StartEvaluation, нет события `started`.** Комната АВТОМАТИЧЕСКИ вошла в EVALUATION,
  когда завершилась защита последнего выступающего (10.1 `defense:finished`,
  PRESENTATION_DEFENSE → EVALUATION), так что 10.2 не добавляет стартового действия и
  рассылки `started` (она была бы аддитивной позже, если когда-либо понадобится).
- **Оценивающему никогда не доверяют из тела.** `evaluatorTeamId` голоса TEAM
  выводится из собственной команды действующего капитана (captain-авторизация + симметричный
  cross-tenant guard); идентичность голоса HOST — из `room.hostId`. Команда никогда не может
  оценить саму себя (`SelfEvaluationError` 403, до любой записи; entity подстраховывает
  ту же форму).
- **Create-or-update + неизменяемый confirm, под per-room advisory-локом** (ПЕРВЫМ
  стейтментом каждой транзакции). Переотправка неподтверждённой оценки
  перезаписывает её; подтверждённая оценка заморожена (`EvaluationAlreadyConfirmedError`
  409). У Confirm ДВЕ гранулярности: per-target (СТРОГИЙ — 404 при отсутствии черновика, 409
  при уже подтверждённой) и all-at-once (опустить `targetTeamId` — замораживает только
  оставшиеся черновики оценивающего, пропуская уже-подтверждённые строки, так что per-target-проход,
  а затем all-at-once-финиш никогда не дедлочат; идемпотентно, когда ничего не
  осталось). 23505 уникального индекса вставки — лишь защитная сеть.
- **Порядок эмиссии фиксирован.** Submit: `score-submitted`, затем `progress-updated`.
  Confirm: по одному `score-confirmed` на замороженную строку, затем единственный `progress-updated`
  (полностью пропускается, когда all-at-once ничего не подтвердил). Results: `completed`,
  затем `results-calculated`, ОБА эмитируются ПОСЛЕ коммита транзакции (⚠️D —
  финиш §14.10 необратим и не имеет корректирующего события, так что рассылка не должна
  никогда предшествовать долговечной записи).
- **Всё room-wide.** Поверхности `client:evaluation:*` нет: каждая мутация — это
  REST-действие — `POST rooms/:code/evaluation/{team,host}`, `.../{team,host}/confirm`
  и `.../results` (PlayerIdentityGuard / HostAuthGuard, 200) — а
  `GET rooms/:code/evaluation/{criteria,teams,progress,results}` — это открытые чтения.
- **10.3 закрывает backbone (EVALUATION → RESULTS, затем FINISHED).**
  CalculateResults добавляет ребро STAGE_FLOW `EVALUATION: ['RESULTS']` и, в ОДНОЙ
  транзакции, `transitionTo('RESULTS')`, затем `markFinished` (status FINISHED).
  RESULTS ТЕРМИНАЛЬНА — намеренно НЕТ *стадийного* ребра `RESULTS → FINISHED`:
  FINISHED — это СТАТУС комнаты, устанавливаемый `markFinished`, а не стадия. Повторный
  вызов вне стадии (уже за EVALUATION) → 409 (идемпотентность); частичный
  подсчёт отклоняется гейтом полноты (`EvaluationNotCompleteError` 409),
  если не выставлен `force`. Отдельные оценки ОСТАЮТСЯ приватными — `results-calculated`
  / `GET results` раскрывают только покомандные АГРЕГАТЫ.

## Этап 5.2a — что поставляется сейчас

Под-этап 5.2a реализует лобби поверх **REST** и эмитирует room-wide
рассылки ниже из use-case'ов через `RealtimeEventsPort.emitToRoom`
(аудитория: room). Константы лежат в
`src/game-session/application/events/game-session-events.ts`.

**Входящие команды `client:game-session:*` отложены (forward-path).** В
5.2a нет обработчиков WebSocket-команд: каждая мутация (create/join room,
действия с командой, профиль, start, close, reconnect) — это REST-вызов.
Строки `client:game-session:*` выше — это запланированный WS forward-path 5.2b и
ещё не подключены. Доставка с областью host/team/captain, снимки `room:state`/`error`
для отправителя, и события жизненного цикла соединения
(`connection:lost/restored`, `client/host:reconnected` по сокету) — тоже
5.2b — 5.2a эмитирует только room-wide.

### Payload'ы событий room-wide (5.2a)

Общие проекции (value-объекты развёрнуты в примитивы):

- **RoomSummary** = `{ id, code, status, currentStage, currentTeamId }`
- **PlayerSummary** = `{ id, roomId, teamId, name, avatar, isCaptain, connectionStatus }`
- **TeamSummary** = `{ id, roomId, name, captainPlayerId, selectedTopicId, isReady, turnOrder }`

| Каноническое имя | Payload |
|---|---|
| `server:game-session:player-joined` | `{ roomId, player: PlayerSummary }` |
| `server:game-session:player-profile-updated` | `{ roomId, player: PlayerSummary }` |
| `server:game-session:team-created` | `{ roomId, team: TeamSummary, captain: PlayerSummary }` |
| `server:game-session:team-joined` | `{ roomId, teamId, player: PlayerSummary }` |
| `server:game-session:team-updated` | `{ roomId, teamId, team: TeamSummary }` |
| `server:game-session:team-topic-selected` | `{ roomId, team: TeamSummary }` |
| `server:game-session:team-ready-changed` | `{ roomId, team: TeamSummary }` |
| `server:game-session:game-can-start-changed` | `{ roomId, canStart: boolean, readyCount: number }` |
| `server:game-session:room-closed` | `{ roomId, room: RoomSummary }` |
| `server:game-session:client-reconnected` | `{ roomId, player: PlayerSummary }` |
| `server:game-session:host-reconnected` | `{ roomId, hostId }` |
| `server:game-session:game-started` | `{ roomId, room: RoomSummary, teams: TeamSummary[] }` |
| `server:game-session:game-first-team-selected` | `{ roomId, currentTeamId }` |
| `server:game-session:game-stage-changed` | `{ roomId, stage }` |
| `server:game-session:game-turn-changed` | `{ roomId, currentTeamId }` |
| `server:game-session:game-state-updated` | `{ roomId, room: RoomSummary, teams: TeamSummary[] }` |

`game-can-start-changed` в каталоге — событие с аудиторией host; в 5.2a оно
рассылается room-wide (присутствия сокетов ещё нет), и клиенты могут его игнорировать.
`player-left` (выход из комнаты) в 5.2a не эмитируется — выход из *команды* эмитирует
`team-updated`.

## Этап 5.2b — присутствие WebSocket, переподключение и снимок

Под-этап 5.2b добавляет сокетную сторону переподключения поверх 5.2a. **Игровые
мутации остаются REST** — обработчиков входящих команд `client:game-session:*`
по-прежнему нет (см. _forward-path_ ниже). Что поставляет 5.2b:

- **Идентичность сокета на handshake.** Клиент открывает сокет с
  `auth.reconnectToken` (или `?reconnectToken=`). `GameSessionGateway`
  (`src/game-session/presentation/ws/`) разрешает принципала — игрока
  (`Player.findByReconnectToken` → `{ roomId, playerId }`) или ведущего
  (`Room.findByHostReconnectToken` → `{ roomId }`) — присоединяет сокет к
  группе комнаты, регистрирует присутствие и запускает существующий use-case
  `ReconnectClient`. Сокет, несущий **никакого** токена переподключения (отсутствует или пуст),
  этот gateway **игнорирует** — он остаётся анонимным транспортным сокетом, обслуживаемым базовым
  `RealtimeGateway` (его никогда не присоединяют, не ошибают, не отключают). Только
  **непустой** токен, который не удаётся разрешить, получает один `error`, затем принудительное
  отключение.
- **Реестр присутствия.** In-memory карта живых сокетов на идентичность
  (multi-tab безопасна): игрок помечается `DISCONNECTED`, только когда его **последний**
  сокет отваливается. См. _Модель присутствия_ ниже.
- **Снимок отправителю.** После успешного переподключения gateway
  отправляет `connection-restored`, затем полный снимок `room-state` **только
  этому сокету** (`emitToClient`), тогда как room-wide рассылка `client-reconnected` /
  `host-reconnected` эмитируется `ReconnectClient` (без изменений с
  5.2a).

### Два gateway, один Socket.IO-сервер

`GameSessionGateway` — это второй `@WebSocketGateway()` (без namespace), который
подключается к **тому же** Socket.IO-серверу, что и транспортный-только
`RealtimeGateway`. Он никогда не инжектит `@WebSocketServer()`: он группирует сокеты через
`client.join(roomId)` и публикует через `RealtimeEventsPort`
(`emitToClient` / `emitToRoom`), так что слой приложения остаётся свободным от транспорта.
Базовый `RealtimeGateway` остаётся чистым транспортом.

### Кто что эмитирует

| Область | Эмиттер | Через |
|---|---|---|
| room-wide рассылки лобби/игры | use-case'ы (5.2a, без изменений) | `emitToRoom` |
| `client-reconnected` / `host-reconnected` (room) | `ReconnectClient` (без изменений) | `emitToRoom` |
| `connection-lost` (room) | `MarkClientDisconnectedUseCase` | `emitToRoom` |
| `connection-restored`, `room-state`, `error` (отправителю) | `GameSessionGateway` | `emitToClient(client.id, …)` |

### Payload'ы отправителя и соединения (5.2b)

`RoomStateResponseDto` — та же форма, что возвращают REST-эндпоинты room-state
(`{ room, players[], teams[] }`).

| Каноническое имя | Область | Аудитория | Payload |
|---|---|---|---|
| `server:realtime:connection-lost` | realtime | room | `{ roomId, playerId }` |
| `server:realtime:connection-restored` | realtime | отправителю | `{ roomId, playerId: string \| null }` (`null` для ведущего) |
| `server:game-session:room-state` | game-session | отправителю | `RoomStateResponseDto` |
| `server:game-session:error` | game-session | отправителю | `{ code, message }` (это `AppError`, например `INVALID_RECONNECT_TOKEN`) |
| `server:realtime:error` | realtime | отправителю | `{ code: 'INTERNAL_ERROR', message: 'Internal error' }` (не-`AppError`, без секретов) |

`client-reconnected` `{ roomId, player: PlayerSummary }` и `host-reconnected`
`{ roomId, hostId }` сохраняют свою форму 5.2a и аудиторию room.

### Поток переподключения (handshake)

1. Прочитать `auth.reconnectToken`/query (локальная копия `readReconnectToken` в
   `presentation/ws/handshake.ts`; базовый gateway не тронут). **Нет токена
   (отсутствует или пуст) → немедленный возврат:** сокет оставляется нетронутым как
   анонимный транспортный сокет для базового `RealtimeGateway` (без join, без
   присутствия, без `error`, без отключения).
2. Разрешить принципала для непустого токена. Игрок → `{ roomId, playerId }`;
   ведущий → `{ roomId }`. Токен, который **не** разрешается (неизвестный / некорректный /
   просрочен) → `emitToClient(server:game-session:error, { code:
   'INVALID_RECONNECT_TOKEN' })`, затем `client.disconnect(true)`.
3. `client.join(roomId)`; зарегистрировать сокет в реестре присутствия.
4. `ReconnectClient.execute({ roomId, principalHint, playerId? })` — ветка игрока
   помечает игрока `CONNECTED` и рассылает `client-reconnected`
   room-wide; ветка ведущего рассылает `host-reconnected`. Он **возвращает**
   снимок комнаты.
5. Gateway отправляет `connection-restored`, затем `room-state` отправителю
   из возвращённого снимка.

`handleConnection` — `async`, и Nest его не await'ит, так что всё его тело выполняется
в `try/catch`: брошенный `AppError` становится `game-session:error`, что-либо
иное — `realtime:error` без секретов.

### Отключение

На `handleDisconnect` gateway снимает сокет с регистрации присутствия:

- **Ведущий** — только очистка. Без события; комната остаётся живой (план §14.1).
- **Игрок, последний сокет этой идентичности** — `MarkClientDisconnectedUseCase`
  помечает игрока `DISCONNECTED` и рассылает `connection-lost` room-wide.
- **Игрок, другой сокет ещё открыт** — только очистка (multi-tab).

### Модель присутствия

Реестр держит прямую карту `socketId → entry` и обратную карту
`identityKey → Set<socketId>` (`identityKey`: игрок `p:<playerId>`, ведущий
`h:<roomId>`). `markDisconnected` срабатывает, только когда уходит **последний** сокет
идентичности. Она **in-memory, на процесс** — корректно для single-node
MVP. Multi-node присутствие (общее хранилище / Redis-адаптер Socket.IO) —
вне scope и отложено.

### Намеренные пропуски (5.2b)

- **Forward-path команды `client:game-session:*` не реализованы.** Каждая
  игровая мутация остаётся REST; строки команд выше остаются запланированным WS
  forward-path.
- **Нет события отключения ведущего.** Отпадение ведущего по дизайну — только очистка
  (§14.1) — комната должна пережить перезагрузку ведущего.
- **Нет TTL токена.** Просроченный токен просто «не найден» и идёт тем же
  путём невалидного токена; принуждение TTL — post-MVP.
- **`game:canStartChanged` остаётся room-wide.** Механизм host-сокета теперь
  существует (`HostRealtimeEventsPort.emitToHost`, Этап 6.2b ниже), но сужение
  этого события лобби до аудитории host остаётся отложенным.

## Этап 6.2b — доставка на host-сокет

Под-этап 6.2b реализует **аудиторию host** для двух host-строк §16.4:
`cell-selection-requested` (теперь host-only, больше не room-wide) и
`question-correct-answer-shown-to-host` (новая эмиссия). Боевые use-case'ы
публикуют их через выделенный порт приложения,
`HostRealtimeEventsPort.emitToHost(roomId, event, payload)`
(`src/game-session/application/ports/`); core-порт `RealtimeEventsPort`
не тронут.

- **Механизм: обратный поиск присутствия, а не транспортная группа.**
  `PresenceHostRealtimeEventsAdapter` (`presentation/ws/`) разрешает живые сокеты
  ведущего через реестр присутствия 5.2b (идентичность `h:<roomId>`, каждая
  открытая вкладка ведущего) и эмитирует каждому через `emitToClient`. «Группа host»
  Socket.IO была намеренно отвергнута: публичный `client:realtime:join-room`
  базового gateway позволил бы любому сокету присоединиться к ней и прочитать
  секреты ведущего.
- **Гейтинг раскрытия.** `question-correct-answer-shown-to-host`
  (`{ roomId, cellId, correctAnswer }`) эмитируется ReviewAnswer **только когда
  запрос несёт `revealAnswer: true`**. Это дополнение к REST —
  `current/host` / `current/answer` (HostAuthGuard) остаются источником
  истины; room-wide payload'ы по-прежнему никогда не содержат `correctAnswer`.
- **No-op без host-сокетов.** При отсутствии живого host-сокета эмиссия просто
  не адресована никому; REST-мутация успешно проходит без изменений.
- **Single-node.** Присутствие — in-memory на процесс (см. _Модель присутствия_
  выше), так что доставка host разделяет тот же single-node MVP scope.
