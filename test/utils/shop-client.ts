import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HOST_HEADER } from './gameplay-client';

/**
 * Thin REST wrappers for the shop endpoints (sub-stage 8.2), mirroring
 * gameplay-client. Each returns the raw supertest {@link request.Response}
 * (status NOT pre-asserted) so the spec can assert success and rejection codes
 * alike.
 */

const http = (app: INestApplication) => request(app.getHttpServer());

export function getShopItems(
  app: INestApplication,
  code: string,
): Promise<request.Response> {
  return http(app).get(`/api/rooms/${code}/shop/items`);
}

export function getShopRound(
  app: INestApplication,
  code: string,
): Promise<request.Response> {
  return http(app).get(`/api/rooms/${code}/shop/round`);
}

export function closeShop(
  app: INestApplication,
  code: string,
  hostToken: string,
): Promise<request.Response> {
  return http(app)
    .post(`/api/rooms/${code}/shop/close`)
    .set(HOST_HEADER, hostToken);
}
