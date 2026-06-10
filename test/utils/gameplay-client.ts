import { INestApplication } from '@nestjs/common';
import request from 'supertest';

/**
 * Thin REST wrappers for the battle-cycle endpoints (sub-stage 6.2a), mirroring
 * lobby-client. Each returns the raw supertest {@link request.Response} (status
 * NOT pre-asserted) so the spec can assert success and rejection codes alike.
 */

export const HOST_HEADER = 'X-Host-Token';
export const PLAYER_HEADER = 'X-Player-Token';

const http = (app: INestApplication) => request(app.getHttpServer());

export function getBoard(
  app: INestApplication,
  code: string,
): Promise<request.Response> {
  return http(app).get(`/api/rooms/${code}/board`);
}

export function getActiveCell(
  app: INestApplication,
  code: string,
): Promise<request.Response> {
  return http(app).get(`/api/rooms/${code}/board/active-cell`);
}

export function getGameState(
  app: INestApplication,
  code: string,
): Promise<request.Response> {
  return http(app).get(`/api/rooms/${code}/game/state`);
}

export function selectCell(
  app: INestApplication,
  code: string,
  playerToken: string,
  cellId: string,
): Promise<request.Response> {
  return http(app)
    .post(`/api/rooms/${code}/board/select`)
    .set(PLAYER_HEADER, playerToken)
    .send({ cellId });
}

export function openQuestion(
  app: INestApplication,
  code: string,
  hostToken: string,
  cellId: string,
): Promise<request.Response> {
  return http(app)
    .post(`/api/rooms/${code}/questions/open`)
    .set(HOST_HEADER, hostToken)
    .send({ cellId });
}

export function rejectSelection(
  app: INestApplication,
  code: string,
  hostToken: string,
  cellId: string,
): Promise<request.Response> {
  return http(app)
    .post(`/api/rooms/${code}/questions/reject`)
    .set(HOST_HEADER, hostToken)
    .send({ cellId });
}

export function submitAnswer(
  app: INestApplication,
  code: string,
  playerToken: string,
  answer?: string,
): Promise<request.Response> {
  return http(app)
    .post(`/api/rooms/${code}/questions/answer`)
    .set(PLAYER_HEADER, playerToken)
    .send(answer === undefined ? {} : { answer });
}

export function reviewAnswer(
  app: INestApplication,
  code: string,
  hostToken: string,
  accepted: boolean,
  revealAnswer?: boolean,
): Promise<request.Response> {
  const body =
    revealAnswer === undefined ? { accepted } : { accepted, revealAnswer };
  return http(app)
    .post(`/api/rooms/${code}/questions/review`)
    .set(HOST_HEADER, hostToken)
    .send(body);
}

export function getCurrentQuestion(
  app: INestApplication,
  code: string,
): Promise<request.Response> {
  return http(app).get(`/api/rooms/${code}/questions/current`);
}

export function getCurrentQuestionForHost(
  app: INestApplication,
  code: string,
  hostToken: string,
): Promise<request.Response> {
  return http(app)
    .get(`/api/rooms/${code}/questions/current/host`)
    .set(HOST_HEADER, hostToken);
}

export function getCurrentAnswer(
  app: INestApplication,
  code: string,
  hostToken?: string,
): Promise<request.Response> {
  const req = http(app).get(`/api/rooms/${code}/questions/current/answer`);
  return hostToken ? req.set(HOST_HEADER, hostToken) : req;
}

export function getTimer(
  app: INestApplication,
  code: string,
): Promise<request.Response> {
  return http(app).get(`/api/rooms/${code}/game/timer`);
}

export function advance(
  app: INestApplication,
  code: string,
  hostToken: string,
): Promise<request.Response> {
  return http(app)
    .post(`/api/rooms/${code}/game/advance`)
    .set(HOST_HEADER, hostToken);
}
