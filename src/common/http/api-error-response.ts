import { ApiProperty } from '@nestjs/swagger';

/**
 * Shared REST error envelope. Every controller returns this shape on failure so
 * the frontend can rely on one error contract. Kept intentionally small; no
 * feature-specific error catalogs live here (those arrive with their stages).
 */
export interface ApiErrorBody {
  /** Stable, machine-readable code (e.g. NOT_FOUND, VALIDATION_ERROR). */
  code: string;
  /** Human-readable, secret-free message. */
  message: string;
  /** Optional structured context; omitted when empty. */
  details?: unknown;
}

export interface ApiErrorResponse {
  error: ApiErrorBody;
  /** ISO-8601 time the error was produced. */
  timestamp: string;
  /** Request path that produced the error. */
  path: string;
}

/** Swagger documentation model for {@link ApiErrorBody}. */
export class ApiErrorBodyDto implements ApiErrorBody {
  @ApiProperty({ example: 'NOT_FOUND' })
  code!: string;

  @ApiProperty({ example: 'Resource not found' })
  message!: string;

  @ApiProperty({ required: false, nullable: true })
  details?: unknown;
}

/** Swagger documentation model for {@link ApiErrorResponse}. */
export class ApiErrorResponseDto implements ApiErrorResponse {
  @ApiProperty({ type: ApiErrorBodyDto })
  error!: ApiErrorBodyDto;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: '/api/health' })
  path!: string;
}
