/**
 * Cross-feature seam for seeding a room's question board. game-session OWNS the
 * port because it is the caller (StartGame); the gameplay feature PROVIDES the
 * implementation ({@link InitializeBoardUseCase}) and exports the binding from
 * its module. The dependency stays one-way — game-session declares the contract,
 * gameplay fulfils it — so game-session never reaches into gameplay internals.
 *
 * Sub-stage 6.1: StartGame calls `initializeBoard(roomId)` inside its existing
 * transaction, right after the room advances to GAME_BOARD. The implementation
 * is idempotent (skip-if-exists), so a re-entrant start never duplicates cells.
 */
export interface BoardInitializationPort {
  initializeBoard(roomId: string): Promise<void>;
}

export const BOARD_INITIALIZATION_PORT = Symbol('BoardInitializationPort');
