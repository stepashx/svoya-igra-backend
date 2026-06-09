import { teams } from '../../../../infrastructure/database/schema';
import { Team } from '../../../domain/entities';
import { Score, TeamName } from '../../../domain/value-objects';

type TeamRow = typeof teams.$inferSelect;
type TeamInsert = typeof teams.$inferInsert;

/**
 * Row → entity. Integer scores are wrapped into {@link Score} value objects;
 * nullable soft links (`captainPlayerId`, `selectedTopicId`,
 * `presentationSubmissionId`) and `turnOrder` / dates pass through unchanged.
 */
export function mapRowToTeam(row: TeamRow): Team {
  return Team.reconstitute({
    id: row.id,
    roomId: row.roomId,
    name: TeamName.fromPersistence(row.name),
    captainPlayerId: row.captainPlayerId,
    selectedTopicId: row.selectedTopicId,
    isReady: row.isReady,
    turnOrder: row.turnOrder,
    earnedScore: Score.fromPersistence(row.earnedScore),
    balance: Score.fromPersistence(row.balance),
    presentationSubmissionId: row.presentationSubmissionId,
    createdAt: row.createdAt,
  });
}

/** Entity → full insert payload (value objects unwrapped to primitives). */
export function mapTeamToInsert(team: Team): TeamInsert {
  return {
    id: team.id,
    roomId: team.roomId,
    name: team.name.value,
    captainPlayerId: team.captainPlayerId,
    selectedTopicId: team.selectedTopicId,
    isReady: team.isReady,
    turnOrder: team.turnOrder,
    earnedScore: team.earnedScore.value,
    balance: team.balance.value,
    presentationSubmissionId: team.presentationSubmissionId,
    createdAt: team.createdAt,
  };
}

/** Entity → partial update payload (mutable columns only; `name` is fixed). */
export function mapTeamToUpdate(team: Team): Partial<TeamInsert> {
  return {
    captainPlayerId: team.captainPlayerId,
    selectedTopicId: team.selectedTopicId,
    isReady: team.isReady,
    turnOrder: team.turnOrder,
    earnedScore: team.earnedScore.value,
    balance: team.balance.value,
    presentationSubmissionId: team.presentationSubmissionId,
  };
}
