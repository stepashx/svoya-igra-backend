/**
 * Game lifecycle stage (plan §13), declared as the domain's OWN union literal.
 *
 * The domain never imports the Drizzle schema (`_shared/enums.ts`) — keeping it
 * free of infrastructure. Conformance with the persistence column is enforced at
 * compile time by the mappers: a schema-union value is assigned to this domain
 * union (on read) and back (on write); the assignment only type-checks while the
 * two unions stay identical, so any drift breaks the build.
 *
 * Sub-stage 5.1 drives only the lobby flow LOBBY → TEAM_SETUP → READY_CHECK →
 * GAME_BOARD, but the type carries every stage so later sub-stages need not widen
 * it.
 */
export type GameStage =
  | 'LOBBY'
  | 'TEAM_SETUP'
  | 'READY_CHECK'
  | 'GAME_BOARD'
  | 'QUESTION_OPENED'
  | 'ANSWER_REVIEW'
  | 'SHOP'
  | 'PRESENTATION_PREPARATION'
  | 'PRESENTATION_DEFENSE'
  | 'EVALUATION'
  | 'RESULTS'
  | 'FINISHED';
