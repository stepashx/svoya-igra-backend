import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HOST_HEADER, PLAYER_HEADER } from './gameplay-client';

/**
 * Thin REST wrappers for the presentation endpoints (sub-stages 9.2/9.3),
 * mirroring shop-client. Each returns the raw supertest {@link request.Response}
 * (status NOT pre-asserted) so the spec can assert success and rejection codes
 * alike. The upload helpers send real multipart bodies via `.attach`.
 */

const http = (app: INestApplication) => request(app.getHttpServer());

/** The multipart file part for an upload/replace. */
export interface UploadFile {
  buffer: Buffer;
  filename: string;
  contentType: string;
  /** Override the multipart field name (defaults to the expected `file`). */
  field?: string;
}

export function startPreparation(
  app: INestApplication,
  code: string,
  hostToken: string,
): Promise<request.Response> {
  return http(app)
    .post(`/api/rooms/${code}/presentation/start-preparation`)
    .set(HOST_HEADER, hostToken);
}

export function getDeadline(
  app: INestApplication,
  code: string,
): Promise<request.Response> {
  return http(app).get(`/api/rooms/${code}/presentation/deadline`);
}

export function getSubmissions(
  app: INestApplication,
  code: string,
): Promise<request.Response> {
  return http(app).get(`/api/rooms/${code}/presentation/submissions`);
}

export function getFiles(
  app: INestApplication,
  code: string,
): Promise<request.Response> {
  return http(app).get(`/api/rooms/${code}/presentation/files`);
}

function attachUpload(
  req: request.Test,
  playerToken: string,
  file: UploadFile,
): Promise<request.Response> {
  return req
    .set(PLAYER_HEADER, playerToken)
    .attach(file.field ?? 'file', file.buffer, {
      filename: file.filename,
      contentType: file.contentType,
    });
}

export function uploadPresentation(
  app: INestApplication,
  code: string,
  playerToken: string,
  file: UploadFile,
): Promise<request.Response> {
  return attachUpload(
    http(app).post(`/api/rooms/${code}/presentation/upload`),
    playerToken,
    file,
  );
}

export function replacePresentation(
  app: INestApplication,
  code: string,
  playerToken: string,
  file: UploadFile,
): Promise<request.Response> {
  return attachUpload(
    http(app).put(`/api/rooms/${code}/presentation/upload`),
    playerToken,
    file,
  );
}

/** Upload with NO file part (for the fileIsRequired → 400 path). */
export function uploadWithoutFile(
  app: INestApplication,
  code: string,
  playerToken: string,
): Promise<request.Response> {
  return http(app)
    .post(`/api/rooms/${code}/presentation/upload`)
    .set(PLAYER_HEADER, playerToken);
}
