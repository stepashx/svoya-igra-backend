/**
 * Canonical server → client room-wide event names emitted by the lobby use
 * cases (see docs/realtime-events.md). Sub-stage 5.2a publishes ONLY room-wide
 * broadcasts via {@link RealtimeEventsPort.emitToRoom}; 5.2b adds the two
 * originating-socket members below ({@link GameSessionEvent.RoomState} and
 * {@link GameSessionEvent.Error}), emitted by the GameSessionGateway via
 * {@link RealtimeEventsPort.emitToClient}. The constants are the canonical
 * strings from the event catalog — kept here (not in the transport module) so
 * the application layer stays free of transport imports.
 */
export const GameSessionEvent = {
  // §16.1 Common
  RoomState: 'server:game-session:room-state',
  RoomClosed: 'server:game-session:room-closed',
  Error: 'server:game-session:error',
  ClientReconnected: 'server:game-session:client-reconnected',
  HostReconnected: 'server:game-session:host-reconnected',
  // §16.2 Lobby
  PlayerJoined: 'server:game-session:player-joined',
  PlayerLeft: 'server:game-session:player-left',
  PlayerProfileUpdated: 'server:game-session:player-profile-updated',
  TeamCreated: 'server:game-session:team-created',
  TeamJoined: 'server:game-session:team-joined',
  TeamUpdated: 'server:game-session:team-updated',
  TeamTopicSelected: 'server:game-session:team-topic-selected',
  TeamReadyChanged: 'server:game-session:team-ready-changed',
  GameCanStartChanged: 'server:game-session:game-can-start-changed',
  // §16.3 Game start
  GameStarted: 'server:game-session:game-started',
  GameFirstTeamSelected: 'server:game-session:game-first-team-selected',
  GameStageChanged: 'server:game-session:game-stage-changed',
  GameTurnChanged: 'server:game-session:game-turn-changed',
  GameStateUpdated: 'server:game-session:game-state-updated',
} as const;

export type GameSessionEvent =
  (typeof GameSessionEvent)[keyof typeof GameSessionEvent];
