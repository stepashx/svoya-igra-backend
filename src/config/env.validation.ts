import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

/**
 * Single source of truth for environment configuration. Validated once at
 * startup; the app refuses to boot if a required variable is missing or
 * malformed. Defaults are provided only for non-secret, configurable values
 * (timers, limits, file size, penalty) — never for credentials or URLs.
 */
export const envSchema = z.object({
  // App / server
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default('api'),
  API_VERSION: z.string().default('v1'),

  // API docs (Swagger)
  SWAGGER_PATH: z.string().default('docs'),

  // CORS / frontend origin
  FRONTEND_ORIGIN: z.string().default('*'),

  // Database (PostgreSQL)
  DATABASE_URL: z.string().url(),

  // MinIO / S3 storage
  MINIO_ENDPOINT: z.string().min(1),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().min(1),
  MINIO_PUBLIC_URL: z.string().url(),
  MINIO_USE_SSL: booleanFromString.default('false'),
  MINIO_PATH_STYLE: booleanFromString.default('true'),

  // WebSocket transport
  WS_PATH: z.string().default('/socket.io'),
  WS_CORS_ORIGIN: z.string().default('*'),

  // File limits / presentation
  MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(25),
  ALLOWED_PRESENTATION_FORMATS: z.string().default('pdf,ppt,pptx'),
  LATE_PENALTY: z.coerce.number().nonnegative().default(1),

  // Timers (seconds)
  ANSWER_TIMER_SECONDS: z.coerce.number().int().positive().default(60),
  SHOP_TIMER_SECONDS: z.coerce.number().int().positive().default(120),
  PRESENTATION_PREP_SECONDS: z.coerce.number().int().positive().default(600),

  // Game limits
  MAX_TEAMS: z.coerce.number().int().positive().default(3),
  MIN_TEAMS_TO_START: z.coerce.number().int().positive().default(2),
  MAX_PLAYERS_PER_TEAM: z.coerce.number().int().positive().default(5),

  // Reconnect / token settings
  ROOM_CODE_LENGTH: z.coerce.number().int().positive().default(6),
  RECONNECT_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(86400),
});

export type Env = z.infer<typeof envSchema>;

/**
 * `validate` hook for @nestjs/config. Throws a clear, aggregated error when
 * required variables are missing or malformed so the process fails fast.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
