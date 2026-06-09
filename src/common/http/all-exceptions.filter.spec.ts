import {
  ArgumentsHost,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AppError,
  DomainRuleError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../core/errors/app.error';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ApiErrorResponse } from './api-error-response';

/** A feature error that narrows a semantic base to a concrete machine code. */
class RoomNotFoundError extends NotFoundError {
  readonly code = 'ROOM_NOT_FOUND';
  constructor() {
    super('Room not found.');
  }
}

/** A bare AppError that matches none of the semantic bases (→ 400 default). */
class WeirdError extends AppError {
  readonly code = 'WEIRD';
  constructor() {
    super('Something odd.');
  }
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  // The filter logs 5xx server-side by design; silence it for clean test output.
  beforeAll(() => jest.spyOn(Logger.prototype, 'error').mockImplementation());
  afterAll(() => jest.restoreAllMocks());

  const run = (exception: unknown, url = '/api/resource') => {
    const json = jest.fn();
    const status = jest.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status, json }),
        getRequest: () => ({ url }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(exception, host);
    return {
      status: status.mock.calls[0][0] as number,
      body: json.mock.calls[0][0] as ApiErrorResponse,
    };
  };

  it('maps NotFoundError (and subclasses) to 404, preserving the machine code', () => {
    const { status, body } = run(new RoomNotFoundError());
    expect(status).toBe(HttpStatus.NOT_FOUND);
    expect(body.error.code).toBe('ROOM_NOT_FOUND');
    expect(body.error.message).toBe('Room not found.');
    expect(body.path).toBe('/api/resource');
    expect(typeof body.timestamp).toBe('string');
  });

  it('maps ValidationError to 400', () => {
    const { status, body } = run(new ValidationError('bad input'));
    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('maps ForbiddenError to 403', () => {
    const { status, body } = run(new ForbiddenError('nope'));
    expect(status).toBe(HttpStatus.FORBIDDEN);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('maps DomainRuleError to 409', () => {
    const { status, body } = run(new DomainRuleError('conflict'));
    expect(status).toBe(HttpStatus.CONFLICT);
    expect(body.error.code).toBe('DOMAIN_RULE_VIOLATION');
  });

  it('maps a bare AppError (no semantic base) to 400', () => {
    const { status, body } = run(new WeirdError());
    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body.error.code).toBe('WEIRD');
  });

  it('maps a Nest HttpException', () => {
    const { status, body } = run(new NotFoundException('missing'));
    expect(status).toBe(HttpStatus.NOT_FOUND);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('missing');
  });

  it('renders unknown errors as a secret-free 500', () => {
    const { status, body } = run(new Error('db password=secret'));
    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(body.error.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});
