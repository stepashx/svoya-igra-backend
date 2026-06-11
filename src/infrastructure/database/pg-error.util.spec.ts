import { asUniqueViolation } from './pg-error.util';

/** A minimal stand-in for a `pg` DatabaseError (code + constraint). */
const pgUnique = (constraint: string): Error =>
  Object.assign(new Error('duplicate key value'), {
    code: '23505',
    constraint,
  });

describe('asUniqueViolation', () => {
  it('narrows a top-level pg 23505 and carries its constraint', () => {
    expect(asUniqueViolation(pgUnique('rooms_code_uq'))).toEqual({
      constraint: 'rooms_code_uq',
    });
  });

  it('unwraps a Drizzle-wrapped error (pg error on .cause)', () => {
    const wrapped = Object.assign(new Error('Failed query'), {
      query: 'insert into ...',
      cause: pgUnique('purchases_room_id_shop_item_id_uq'),
    });
    expect(asUniqueViolation(wrapped)).toEqual({
      constraint: 'purchases_room_id_shop_item_id_uq',
    });
  });

  it('walks a deeper cause chain', () => {
    const nested = Object.assign(new Error('outer'), {
      cause: Object.assign(new Error('middle'), {
        cause: pgUnique('teams_room_id_selected_topic_id_uq'),
      }),
    });
    expect(asUniqueViolation(nested)).toEqual({
      constraint: 'teams_room_id_selected_topic_id_uq',
    });
  });

  it('returns null for a non-23505 error, null and undefined', () => {
    expect(asUniqueViolation(new Error('boom'))).toBeNull();
    expect(asUniqueViolation(null)).toBeNull();
    expect(asUniqueViolation(undefined)).toBeNull();
  });

  it('returns a violation without a constraint when pg omits it', () => {
    const bare = Object.assign(new Error('duplicate'), { code: '23505' });
    expect(asUniqueViolation(bare)).toEqual({ constraint: undefined });
  });
});
