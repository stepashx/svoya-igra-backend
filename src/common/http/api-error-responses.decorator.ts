import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiErrorResponseDto } from './api-error-response';

/**
 * Generic, status-keyed descriptions for the shared error envelope. Deliberately
 * coarse (per HTTP status, NOT per machine `code`): the precise `code` lives in
 * the response body's `error.code`, while these one-liners tell the frontend
 * what a given status MEANS across the API. They mirror the status mapping in
 * {@link AllExceptionsFilter} (`statusForAppError`) and the auth guards.
 */
const ERROR_DESCRIPTIONS: Partial<Record<HttpStatus, string>> = {
  [HttpStatus.BAD_REQUEST]:
    'Malformed room code, invalid path UUID, or request-body validation failure',
  [HttpStatus.UNAUTHORIZED]: 'Missing, malformed, or unknown X-Player-Token',
  [HttpStatus.FORBIDDEN]:
    'Authenticated but not permitted (wrong host token, not the team captain, wrong room/team)',
  [HttpStatus.NOT_FOUND]: 'Room or a referenced resource does not exist',
  [HttpStatus.CONFLICT]:
    'Action conflicts with the current game stage or a domain rule',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'Uploaded file exceeds the size limit',
};

/**
 * Composite Swagger decorator that documents a route's 4xx surface against the
 * shared {@link ApiErrorResponseDto} envelope. Pass the statuses a route can
 * actually return (derived from its guard + body + domain rules — the G0–G6
 * groups in the plan); each becomes an `@ApiResponse` whose schema `$ref`s the
 * one registered error model (see `extraModels` in `swagger.config.ts`). The
 * inline status list self-documents which failures each endpoint can produce.
 */
export function ApiErrorResponses(...statuses: HttpStatus[]) {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: ERROR_DESCRIPTIONS[status],
        schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
      }),
    ),
  );
}
