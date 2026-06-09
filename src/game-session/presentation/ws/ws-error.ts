import { AppError } from '../../../core/errors/app.error';
import { ConnectionEvent, GameSessionEvent } from '../../application/events';

/** The originating-socket error emission an exception maps to. */
export interface WsError {
  readonly event: string;
  readonly payload: { code: string; message: string };
}

/**
 * Map a thrown error to an originating-socket error emission (the WS analogue of
 * {@link AllExceptionsFilter}). An {@link AppError} surfaces its stable `code`
 * and message as `server:game-session:error` so the client can branch on it;
 * anything else collapses to a secret-free `server:realtime:error` with a
 * generic message, so server internals never leak over the socket.
 */
export function toWsError(error: unknown): WsError {
  if (error instanceof AppError) {
    return {
      event: GameSessionEvent.Error,
      payload: { code: error.code, message: error.message },
    };
  }
  return {
    event: ConnectionEvent.Error,
    payload: { code: 'INTERNAL_ERROR', message: 'Internal error' },
  };
}
