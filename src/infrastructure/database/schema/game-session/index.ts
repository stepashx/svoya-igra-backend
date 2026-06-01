/**
 * Game Session schema — placeholder (Stage 5A.1).
 *
 * Tables (rooms, teams, players) are NOT defined yet; they arrive in a later
 * sub-stage. Decisions to honour when they do:
 *   - Topic selection lives in `teams.selectedTopicId` (not on the topic).
 *   - Captain lives in `teams.captainPlayerId` (no `players.isCaptain`).
 *   - No `teams.presentationSubmissionId` — upload metadata lives on the
 *     submission row (see the Presentation area).
 *
 * Status vocabulary (room status, game stage, player connection status) is
 * already defined in `../shared/enums`; reuse it, do not redeclare.
 */
export {};
