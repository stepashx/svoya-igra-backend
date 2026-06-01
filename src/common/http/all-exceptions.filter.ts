import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AppError } from '../../core/errors/app.error';
import { ApiErrorResponse } from './api-error-response';

/**
 * Maps base AppError codes to HTTP statuses. Only the shared/base errors live
 * here — feature-specific error catalogs are intentionally out of scope for the
 * foundation and arrive with their stages.
 */
const APP_ERROR_STATUS: Record<string, HttpStatus> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  VALIDATION_ERROR: HttpStatus.BAD_REQUEST,
  DOMAIN_RULE_VIOLATION: HttpStatus.CONFLICT,
};

/**
 * Global exception filter that renders every failure as the shared
 * {@link ApiErrorResponse} envelope. Thin and secret-free: 5xx responses use a
 * generic message and the original error is logged server-side only.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<{
      status(code: number): unknown;
      json(body: unknown): unknown;
    }>();
    const request = http.getRequest<{ url?: string }>();

    const { status, code, message, details } = this.resolve(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Unhandled error on ${request.url ?? 'unknown path'}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiErrorResponse = {
      error:
        details === undefined ? { code, message } : { code, message, details },
      timestamp: new Date().toISOString(),
      path: request.url ?? '',
    };

    response.status(status);
    response.json(body);
  }

  private resolve(exception: unknown): {
    status: HttpStatus;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof AppError) {
      return {
        status: APP_ERROR_STATUS[exception.code] ?? HttpStatus.BAD_REQUEST,
        code: exception.code,
        message: exception.message,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      return {
        status,
        code: HttpStatus[status] ?? 'HTTP_ERROR',
        message: extractHttpMessage(payload, exception.message),
        details: typeof payload === 'object' ? payload : undefined,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    };
  }
}

/** Pull a human message out of an HttpException response (string or object). */
function extractHttpMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string') {
    return payload;
  }
  if (payload && typeof payload === 'object') {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message)) {
      return message.join(', ');
    }
  }
  return fallback;
}
