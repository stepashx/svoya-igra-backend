import { FinalResult } from '../entities';

/**
 * Persistence port for computed final results (plan §12, §14.10, §15.11). A
 * write-once table: {@link create} is the only write (no `update` — results are
 * immutable), guarded by the `final_results_room_id_team_id_uq` unique index
 * whose 23505 the adapter translates to {@link ResultsAlreadyCalculatedError}.
 * {@link findByRoomId} returns the leaderboard ordered `(place, teamId)` so a
 * results read is deterministic regardless of insertion order. The Drizzle
 * adapter lives in infrastructure/persistence.
 */
export interface FinalResultRepositoryPort {
  create(result: FinalResult): Promise<void>;
  findByRoomId(roomId: string): Promise<FinalResult[]>;
}

export const EVALUATION_FINAL_RESULT_REPOSITORY_PORT = Symbol(
  'FinalResultRepositoryPort',
);
