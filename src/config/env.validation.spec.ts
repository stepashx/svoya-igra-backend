import { validateEnv } from './env.validation';

const requiredEnv = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  MINIO_ENDPOINT: 'localhost',
  MINIO_ACCESS_KEY: 'key',
  MINIO_SECRET_KEY: 'secret',
  MINIO_BUCKET: 'bucket',
  MINIO_PUBLIC_URL: 'http://localhost:9000',
};

describe('validateEnv', () => {
  it('accepts valid config and applies defaults', () => {
    const env = validateEnv(requiredEnv);

    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.MAX_TEAMS).toBe(3);
    expect(env.MIN_TEAMS_TO_START).toBe(2);
    expect(env.MAX_PLAYERS_PER_TEAM).toBe(5);
    expect(env.MINIO_USE_SSL).toBe(false);
  });

  it('coerces numeric strings', () => {
    const env = validateEnv({ ...requiredEnv, PORT: '8080' });
    expect(env.PORT).toBe(8080);
  });

  it('throws a clear error when a required variable is missing', () => {
    const { DATABASE_URL: _omitted, ...withoutDb } = requiredEnv;
    expect(() => validateEnv(withoutDb)).toThrow(
      /Invalid environment configuration/,
    );
    expect(() => validateEnv(withoutDb)).toThrow(/DATABASE_URL/);
  });

  it('rejects a malformed enum value', () => {
    expect(() => validateEnv({ ...requiredEnv, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });
});
