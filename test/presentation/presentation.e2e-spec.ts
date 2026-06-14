import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2EApp } from '../utils/create-e2e-app';
import { closeTruncatePool, truncateLobby } from '../utils/db-truncate';
import { createRoom } from '../utils/lobby-client';

/**
 * Presentation skeleton over real Postgres (sub-stage 9.1): the global
 * requirements catalog read (seeded by db:seed) and the reserved 501 stubs.
 * Touches no lobby/commerce/battle-cycle state beyond creating a room.
 */
describe('Presentation skeleton (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = (await createE2EApp()).app;
  });

  afterAll(async () => {
    await app.close();
    await closeTruncatePool();
  });

  beforeEach(async () => {
    await truncateLobby();
  });

  const http = () => request(app.getHttpServer());

  it('lists the four seeded requirements in display order (9.1)', async () => {
    const room = await createRoom(app);

    const res = await http()
      .get(`/api/rooms/${room.code}/presentation/requirements`)
      .expect(200);

    expect(res.body).toHaveLength(4);
    expect(res.body.map((r: { order: number }) => r.order)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(res.body.map((r: { title: string }) => r.title)).toEqual([
      'Условие 1',
      'Условие 2',
      'Условие 3',
      'Условие 4',
    ]);
    // Full shape of the first row; the 4th condition is the optional one.
    expect(res.body[0]).toEqual({
      id: expect.any(String),
      title: 'Условие 1',
      description: 'Описание условия 1',
      order: 0,
      isRequired: true,
    });
    expect(res.body[3].isRequired).toBe(false);
    // Public catalog — no QR/secret leakage to guard against, but assert the
    // payload is exactly the requirement shape (no stray fields).
    expect(Object.keys(res.body[0]).sort()).toEqual([
      'description',
      'id',
      'isRequired',
      'order',
      'title',
    ]);
  });

  it('returns 404 for the requirements read of an unknown room', async () => {
    await http().get('/api/rooms/ZZZZZZ/presentation/requirements').expect(404);
  });

  it('returns 501 for the deferred upload + files surface (9.3)', async () => {
    const room = await createRoom(app);

    await http()
      .post(`/api/rooms/${room.code}/presentation/upload`)
      .expect(501);
    await http().get(`/api/rooms/${room.code}/presentation/files`).expect(501);
  });
});
