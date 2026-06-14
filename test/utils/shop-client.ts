import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HOST_HEADER, PLAYER_HEADER } from './gameplay-client';

/**
 * Thin REST wrappers for the shop + inventory endpoints (sub-stages 8.2/8.3),
 * mirroring gameplay-client. Each returns the raw supertest
 * {@link request.Response} (status NOT pre-asserted) so the spec can assert
 * success and rejection codes alike.
 */

const http = (app: INestApplication) => request(app.getHttpServer());

/** Token headers for the inventory reads (team member OR host, or neither). */
export interface InventoryCredentials {
  playerToken?: string;
  hostToken?: string;
}

function withCredentials(
  req: request.Test,
  credentials: InventoryCredentials,
): request.Test {
  if (credentials.playerToken !== undefined) {
    req.set(PLAYER_HEADER, credentials.playerToken);
  }
  if (credentials.hostToken !== undefined) {
    req.set(HOST_HEADER, credentials.hostToken);
  }
  return req;
}

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

export function purchaseItem(
  app: INestApplication,
  code: string,
  playerToken: string,
  shopItemId: unknown,
): Promise<request.Response> {
  return http(app)
    .post(`/api/rooms/${code}/shop/purchase`)
    .set(PLAYER_HEADER, playerToken)
    .send({ shopItemId });
}

export function getPurchases(
  app: INestApplication,
  code: string,
): Promise<request.Response> {
  return http(app).get(`/api/rooms/${code}/shop/purchases`);
}

export function getTeamInventory(
  app: INestApplication,
  code: string,
  teamId: string,
  credentials: InventoryCredentials = {},
): Promise<request.Response> {
  return withCredentials(
    http(app).get(`/api/rooms/${code}/inventory/teams/${teamId}`),
    credentials,
  );
}

export function getTeamQrTools(
  app: INestApplication,
  code: string,
  teamId: string,
  credentials: InventoryCredentials = {},
): Promise<request.Response> {
  return withCredentials(
    http(app).get(`/api/rooms/${code}/inventory/teams/${teamId}/qr-tools`),
    credentials,
  );
}
