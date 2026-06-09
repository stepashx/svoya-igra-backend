import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  AppError,
  DomainRuleError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../core/errors/app.error';
import { ApiErrorResponse } from './api-error-response';

/**
 * Maps an {@link AppError} to its HTTP status by its position in the semantic
 * hierarchy — not by its machine `code`. Feature catalogs extend these bases
 * (e.g. `RoomNotFoundError extends NotFoundError`) and inherit the mapping while
 * carrying their own concrete `code` in the response body. A bare `AppError`
 * that matches none of the bases defaults to 400.
 */
function statusForAppError(error: AppError): HttpStatus {
  if (error instanceof NotFoundError) {
    return HttpStatus.NOT_FOUND;
  }
  if (error instanceof ValidationError) {
    return HttpStatus.BAD_REQUEST;
  }
  if (error instanceof ForbiddenError) {
    return HttpStatus.FORBIDDEN;
  }
  if (error instanceof DomainRuleError) {
    return HttpStatus.CONFLICT;
  }
  return HttpStatus.BAD_REQUEST;
}

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
        status: statusForAppError(exception),
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
