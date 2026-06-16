import { Room, Team } from '../../domain/entities';
import { GameStage } from '../../domain/types';

/** The shared shape both host-driven defense advances (Finish/Skip) return. */
export interface DefenseAdvanceResult {
  stage: GameStage;
  /** The next presenter, or null once the last one has finished/skipped. */
  currentPresenterTeamId: string | null;
  /** True iff this advance moved the room on to EVALUATION (last presenter). */
  finished: boolean;
}

/**
 * The next presenter in the defense queue, or `null` at the end of it. Shared by
 * {@link FinishPresentationUseCase} and {@link SkipPresenterUseCase} so the order
 * logic lives in ONE place (the plan's private `advance`).
 *
 * The order is the participants — teams with a non-null `turnOrder` — ascending,
 * the SAME projection StartDefense and the battle turn use (review-answer
 * `moveToNextTurn`). The crucial difference from the battle turn: that one is a
 * round-robin that WRAPS with `% length`, whereas the defense queue is FINITE —
 * past the last presenter there is simply no next team (`order[idx + 1]` is
 * `undefined` → `null`), which is what drives the DEFENSE → EVALUATION exit.
 *
 * Pure: reads `room.currentTeamId`, never mutates.
 */
export function nextDefensePresenter(
  room: Room,
  roomTeams: Team[],
): Team | null {
  const order = roomTeams
    .filter((team) => team.turnOrder !== null)
    .sort((a, b) => (a.turnOrder ?? 0) - (b.turnOrder ?? 0));
  const currentIndex = order.findIndex(
    (team) => team.id === room.currentTeamId,
  );
  return order[currentIndex + 1] ?? null;
}
