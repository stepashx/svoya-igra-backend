/**
 * Player connection status (`Player.connectionStatus`), declared as the domain's
 * OWN union literal. Conformance with the schema column is enforced by the
 * mappers at compile time (see {@link GameStage}).
 */
export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED';
