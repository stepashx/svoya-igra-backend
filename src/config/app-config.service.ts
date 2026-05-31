import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from './env.validation';

/**
 * Typed accessors grouped by category. Feature code reads configuration only
 * through this service — never `process.env` directly.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get app() {
    return {
      nodeEnv: this.get('NODE_ENV'),
      port: this.get('PORT'),
      apiPrefix: this.get('API_PREFIX'),
      isProduction: this.get('NODE_ENV') === 'production',
    };
  }

  get cors() {
    return {
      frontendOrigin: this.get('FRONTEND_ORIGIN'),
    };
  }

  get database() {
    return {
      url: this.get('DATABASE_URL'),
    };
  }

  get storage() {
    return {
      endpoint: this.get('MINIO_ENDPOINT'),
      port: this.get('MINIO_PORT'),
      accessKey: this.get('MINIO_ACCESS_KEY'),
      secretKey: this.get('MINIO_SECRET_KEY'),
      bucket: this.get('MINIO_BUCKET'),
      publicUrl: this.get('MINIO_PUBLIC_URL'),
      useSsl: this.get('MINIO_USE_SSL'),
      pathStyle: this.get('MINIO_PATH_STYLE'),
    };
  }

  get websocket() {
    return {
      path: this.get('WS_PATH'),
      corsOrigin: this.get('WS_CORS_ORIGIN'),
    };
  }

  get fileLimits() {
    return {
      maxFileSizeMb: this.get('MAX_FILE_SIZE_MB'),
      allowedPresentationFormats: this.get('ALLOWED_PRESENTATION_FORMATS')
        .split(',')
        .map((format) => format.trim())
        .filter((format) => format.length > 0),
    };
  }

  get timers() {
    return {
      answerSeconds: this.get('ANSWER_TIMER_SECONDS'),
      shopSeconds: this.get('SHOP_TIMER_SECONDS'),
      presentationPrepSeconds: this.get('PRESENTATION_PREP_SECONDS'),
    };
  }

  get gameLimits() {
    return {
      maxTeams: this.get('MAX_TEAMS'),
      minTeamsToStart: this.get('MIN_TEAMS_TO_START'),
      maxPlayersPerTeam: this.get('MAX_PLAYERS_PER_TEAM'),
    };
  }

  get reconnect() {
    return {
      roomCodeLength: this.get('ROOM_CODE_LENGTH'),
      tokenTtlSeconds: this.get('RECONNECT_TOKEN_TTL_SECONDS'),
      latePenalty: this.get('LATE_PENALTY'),
    };
  }
}
