import {
  ArgumentsHost,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AppError } from '../../core/errors/app.error';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ApiErrorResponse } from './api-error-response';

class NotFoundTestError extends AppError {
  readonly code = 'NOT_FOUND';
  constructor(message: string) {
    super(message);
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

  it('maps a base AppError to its HTTP status and code', () => {
    const { status, body } = run(new NotFoundTestError('Room not found'));
    expect(status).toBe(HttpStatus.NOT_FOUND);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Room not found');
    expect(body.path).toBe('/api/resource');
    expect(typeof body.timestamp).toBe('string');
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
