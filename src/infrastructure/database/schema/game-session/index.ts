/**
 * Game Session schema group (Stage 5A.2).
 *
 * The session-root tables every other feature area hangs off: `rooms`,
 * `players`, `teams`, and the global `presentation_topics` catalog. This file
 * defines the physical Drizzle tables, their constraints/indexes, and the
 * Drizzle query-API relations only. No Game Session behaviour (CreateRoom,
 * JoinRoom, reconnect, readiness, …) lives here — that is Stage 5B.
 *
 * Binding data decisions honoured here (see master context §8 / Stage 5A plan):
 *   - Topic selection lives on `teams.selectedTopicId`, unique per room via
 *     `(roomId, selectedTopicId)` with NULLs allowed (teams with no topic yet).
 *     `presentation_topics` is a global/static catalog with NO `assignedTeamId`.
 *   - Captain lives on `teams.captainPlayerId` (the sole source of truth); there
 *     is NO `players.isCaptain`.
 *   - Host identity (`rooms.hostId`) and `rooms.hostReconnectToken` live on the
 *     room — there is NO separate `hosts` table.
 *   - `teams.earnedScore`/`teams.balance` physically live here but are written
 *     only by Scoring (Gameplay); this group sets their 0 defaults at creation.
 *   - NO `teams.presentationSubmissionId` (upload metadata lives on the
 *     submission row in the Presentation area).
 *
 * Soft cycles (`rooms.currentTeamId` ↔ teams, `players.teamId` ↔ teams ↔
 * `teams.captainPlayerId`) are kept soft with nullable foreign keys so rows can
 * be created in any order; the atomic linking is a Stage 5B transaction.
 *
 * Status vocabulary (room status, game stage, player connection status) is
 * defined once in `../shared/enums` and reused here, never redeclared.
 */
import { relations } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  GAME_STAGES,
  PLAYER_CONNECTION_STATUSES,
  ROOM_STATUSES,
  primaryId,
  timestamps,
} from '../shared';

/**
 * Global, pre-seeded catalog of presentation topics a team can select. Reusable
 * across rooms; the selection (and its per-room uniqueness) lives on `teams`.
 */
export const presentationTopics = pgTable('presentation_topics', {
  id: primaryId(),
  title: text('title').notNull(),
  description: text('description'),
});

/**
 * One game session and its host. `code` and `hostReconnectToken` are unique
 * lookup paths. `currentTeamId` is a nullable soft reference into `teams` (set
 * later by Gameplay's StartGame); counters seed shop triggers.
 */
export const rooms = pgTable('rooms', {
  id: primaryId(),
  code: text('code').notNull().unique(),
  status: text('status', { enum: ROOM_STATUSES }).notNull().default('lobby'),
  currentStage: text('current_stage', { enum: GAME_STAGES })
    .notNull()
    .default('lobby'),
  // Opaque generated host identity — no separate `hosts` table. UUID-typed so
  // it stays compatible with `teams.id` for the later polymorphic evaluator id.
  hostId: uuid('host_id').notNull().defaultRandom(),
  hostReconnectToken: text('host_reconnect_token').notNull().unique(),
  // Soft reference into `teams` (declared below); nullable, never required at
  // room creation. Annotated to break the circular type inference.
  currentTeamId: uuid('current_team_id').references(
    (): AnyPgColumn => teams.id,
  ),
  totalQuestionsCount: integer('total_questions_count').notNull().default(30),
  blockedQuestionsCount: integer('blocked_questions_count')
    .notNull()
    .default(0),
  currentShopRound: integer('current_shop_round').notNull().default(0),
  ...timestamps,
});

/**
 * A participant connected to a room. `teamId` is nullable until the player
 * creates/joins a team. `reconnectToken` is a unique bearer secret; player name
 * is unique within a room. Captaincy is NOT stored here (derived from
 * `teams.captainPlayerId`).
 */
export const players = pgTable(
  'players',
  {
    id: primaryId(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    // Soft reference into `teams` (declared below); nullable during the
    // create-team soft cycle.
    teamId: uuid('team_id').references((): AnyPgColumn => teams.id),
    name: text('name').notNull(),
    avatar: text('avatar'),
    reconnectToken: text('reconnect_token').notNull().unique(),
    connectionStatus: text('connection_status', {
      enum: PLAYER_CONNECTION_STATUSES,
    })
      .notNull()
      .default('connected'),
    ...timestamps,
  },
  (table) => [
    // Unique player name within a room (NULLs not applicable — name is notNull).
    unique('players_room_id_name_unique').on(table.roomId, table.name),
    // Room-scoped reads are the common lookup path.
    index('players_room_id_idx').on(table.roomId),
  ],
);

/**
 * A team competing in a room. `captainPlayerId` is the sole captain source of
 * truth (nullable during the create-team soft cycle). `selectedTopicId` is
 * nullable until chosen and unique per room. `turnOrder` is assigned later by
 * Gameplay's StartGame. `earnedScore`/`balance` default to 0 and are otherwise
 * owned by Scoring.
 */
export const teams = pgTable(
  'teams',
  {
    id: primaryId(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    name: text('name').notNull(),
    captainPlayerId: uuid('captain_player_id').references(
      (): AnyPgColumn => players.id,
    ),
    selectedTopicId: uuid('selected_topic_id').references(
      () => presentationTopics.id,
    ),
    isReady: boolean('is_ready').notNull().default(false),
    turnOrder: integer('turn_order'),
    earnedScore: integer('earned_score').notNull().default(0),
    balance: integer('balance').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    // Two teams in one room cannot pick the same topic; NULLs allowed so
    // multiple "no topic yet" teams coexist (Postgres NULLS DISTINCT default).
    unique('teams_room_id_selected_topic_id_unique').on(
      table.roomId,
      table.selectedTopicId,
    ),
    // Team name unique within a room.
    unique('teams_room_id_name_unique').on(table.roomId, table.name),
    // Room-scoped reads are the common lookup path.
    index('teams_room_id_idx').on(table.roomId),
  ],
);

/**
 * Relations for the Drizzle query API. Two distinct room↔team and player↔team
 * relationships exist, so each is disambiguated with an explicit `relationName`:
 *   - `room_teams`        — a room's teams (`teams.roomId`).
 *   - `room_current_team` — a room's current team (`rooms.currentTeamId`).
 *   - `team_members`      — a team's players (`players.teamId`).
 *   - `team_captain`      — a team's captain (`teams.captainPlayerId`).
 */
export const roomsRelations = relations(rooms, ({ one, many }) => ({
  players: many(players),
  teams: many(teams, { relationName: 'room_teams' }),
  currentTeam: one(teams, {
    fields: [rooms.currentTeamId],
    references: [teams.id],
    relationName: 'room_current_team',
  }),
}));

export const playersRelations = relations(players, ({ one, many }) => ({
  room: one(rooms, {
    fields: [players.roomId],
    references: [rooms.id],
  }),
  team: one(teams, {
    fields: [players.teamId],
    references: [teams.id],
    relationName: 'team_members',
  }),
  // Reverse of `teams.captain`; a player captains at most one team but the
  // non-FK side is modelled as `many` per Drizzle's relation typing.
  captainOf: many(teams, { relationName: 'team_captain' }),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  room: one(rooms, {
    fields: [teams.roomId],
    references: [rooms.id],
    relationName: 'room_teams',
  }),
  // Reverse of `rooms.currentTeam`; non-FK side modelled as `many`.
  currentInRoom: many(rooms, { relationName: 'room_current_team' }),
  captain: one(players, {
    fields: [teams.captainPlayerId],
    references: [players.id],
    relationName: 'team_captain',
  }),
  selectedTopic: one(presentationTopics, {
    fields: [teams.selectedTopicId],
    references: [presentationTopics.id],
  }),
  members: many(players, { relationName: 'team_members' }),
}));

export const presentationTopicsRelations = relations(
  presentationTopics,
  ({ many }) => ({
    teams: many(teams),
  }),
);
