import { PresentationSubmission } from '../entities';

/**
 * Persistence port for per-team presentation submissions (plan §15.10). One
 * submission per team per room (`presentation_submissions_room_id_team_id_uq`).
 * Sub-stage 9.1 shipped the read paths and the create-once write; 9.3 adds
 * {@link replace} (the re-upload UPDATE, keyed on that unique index) and the
 * matching 23505 translation on {@link create}. The Drizzle adapter lives in
 * infrastructure/persistence.
 */
export interface PresentationSubmissionRepositoryPort {
  create(submission: PresentationSubmission): Promise<void>;
  /** Overwrite the team's existing submission in place (re-upload). */
  replace(submission: PresentationSubmission): Promise<void>;
  findByRoomAndTeam(
    roomId: string,
    teamId: string,
  ): Promise<PresentationSubmission | null>;
  findByRoomId(roomId: string): Promise<PresentationSubmission[]>;
}

export const PRESENTATION_SUBMISSION_REPOSITORY_PORT = Symbol(
  'PresentationSubmissionRepositoryPort',
);
