import {
  CaptainAlreadyAssignedError,
  PlayerNameTakenError,
  TopicAlreadyTakenError,
} from '../../domain/errors';
import {
  isRoomCodeUniqueViolation,
  translateUniqueViolation,
} from './pg-error.util';

/** A minimal stand-in for a `pg` DatabaseError (code + constraint). */
const pgUnique = (constraint: string): Error =>
  Object.assign(new Error('duplicate key value'), {
    code: '23505',
    constraint,
  });

/** A `pg` error wrapped the way Drizzle does (real error on `.cause`). */
const drizzleWrapped = (constraint: string): Error =>
  Object.assign(new Error('Failed query'), {
    query: 'insert into ...',
    cause: pgUnique(constraint),
  });

/** Run translate and return whatever it throws. */
const thrownBy = (error: unknown): unknown => {
  try {
    translateUniqueViolation(error);
  } catch (e) {
    return e;
  }
  throw new Error('expected translateUniqueViolation to throw');
};

describe('translateUniqueViolation', () => {
  it('maps players_room_id_name_uq → PlayerNameTakenError', () => {
    expect(thrownBy(pgUnique('players_room_id_name_uq'))).toBeInstanceOf(
      PlayerNameTakenError,
    );
  });

  it('maps teams_room_id_selected_topic_id_uq → TopicAlreadyTakenError', () => {
    expect(
      thrownBy(pgUnique('teams_room_id_selected_topic_id_uq')),
    ).toBeInstanceOf(TopicAlreadyTakenError);
  });

  it('maps players_captain_per_team_uq → CaptainAlreadyAssignedError', () => {
    expect(thrownBy(pgUnique('players_captain_per_team_uq'))).toBeInstanceOf(
      CaptainAlreadyAssignedError,
    );
  });

  it('unwraps a Drizzle-wrapped error (pg error on .cause)', () => {
    expect(thrownBy(drizzleWrapped('players_room_id_name_uq'))).toBeInstanceOf(
      PlayerNameTakenError,
    );
  });

  it('re-throws rooms_code_uq unchanged (the CreateRoom retry signal)', () => {
    const error = pgUnique('rooms_code_uq');
    expect(thrownBy(error)).toBe(error);
  });

  it('re-throws an unknown constraint unchanged', () => {
    const error = pgUnique('some_other_uq');
    expect(thrownBy(error)).toBe(error);
  });

  it('re-throws a non-23505 error unchanged', () => {
    const error = new Error('boom');
    expect(thrownBy(error)).toBe(error);
  });
});

describe('isRoomCodeUniqueViolation', () => {
  it('is true only for the rooms_code_uq violation', () => {
    expect(isRoomCodeUniqueViolation(pgUnique('rooms_code_uq'))).toBe(true);
    expect(isRoomCodeUniqueViolation(pgUnique('players_room_id_name_uq'))).toBe(
      false,
    );
  });

  it('is false for non-Postgres errors', () => {
    expect(isRoomCodeUniqueViolation(new Error('x'))).toBe(false);
    expect(isRoomCodeUniqueViolation(null)).toBe(false);
  });
});
