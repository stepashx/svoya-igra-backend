import { INestApplication } from '@nestjs/common';
import { OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../src/common/http/api-error-response';
import { buildSwaggerDocumentConfig } from '../../src/swagger/swagger.config';
import { createE2EApp } from '../utils/create-e2e-app';

/**
 * Contract test for the generated OpenAPI document (sub-stage 11.2). Boots the
 * real {@link AppModule} (as e2e does) and builds the document exactly like
 * `src/main.ts` → `setupSwagger` (same config + `extraModels` registration), so
 * the shape under test is the one the frontend actually consumes. It asserts
 * the four things 11.2 wires that success-only annotations cannot express:
 * the registered error envelope, the binary upload file-picker, the per-group
 * 4xx surface, and the deprecated `game/finish` stub. No DB writes, no HTTP —
 * just the static document.
 *
 * Path keys carry the global `/api` prefix: this `@nestjs/swagger` version folds
 * `app.setGlobalPrefix('api')` (set in `createE2EApp`, mirroring `main.ts`) into
 * `document.paths`, so a route maps to `/api/rooms/{code}/...`.
 */

const API = '/api';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Expected an object, received: ${String(value)}`);
  }
  return value as JsonObject;
}

/** Drill into a nested OpenAPI structure by string keys, returning the leaf. */
function dig(root: unknown, ...keys: string[]): unknown {
  return keys.reduce<unknown>((node, key) => asObject(node)[key], root);
}

describe('OpenAPI contract (e2e)', () => {
  let app: INestApplication;
  let doc: OpenAPIObject;

  beforeAll(async () => {
    app = (await createE2EApp()).app;
    const config = buildSwaggerDocumentConfig({
      version: 'v1',
      apiPrefix: 'api',
    });
    doc = SwaggerModule.createDocument(app, config, {
      extraModels: [ApiErrorResponseDto],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('error envelope is registered (extraModels)', () => {
    it('exposes ApiErrorResponseDto with error/timestamp/path', () => {
      const schema = asObject(
        dig(doc, 'components', 'schemas', 'ApiErrorResponseDto'),
      );
      expect(Object.keys(asObject(schema.properties))).toEqual(
        expect.arrayContaining(['error', 'timestamp', 'path']),
      );
    });

    it('pulls in ApiErrorBodyDto transitively with code/message/details', () => {
      const schema = asObject(
        dig(doc, 'components', 'schemas', 'ApiErrorBodyDto'),
      );
      expect(Object.keys(asObject(schema.properties))).toEqual(
        expect.arrayContaining(['code', 'message', 'details']),
      );
    });
  });

  describe('paths carry the global /api prefix', () => {
    it('keys routes under /api', () => {
      const paths = asObject(doc.paths);
      expect(paths[`${API}/rooms/{code}/game/start`]).toBeDefined();
      expect(paths['/rooms/{code}/game/start']).toBeUndefined();
    });
  });

  describe('presentation upload advertises a binary file-picker', () => {
    const UPLOAD = `${API}/rooms/{code}/presentation/upload`;
    for (const verb of ['post', 'put'] as const) {
      it(`${verb.toUpperCase()} upload → multipart file:binary, required`, () => {
        const schema = asObject(
          dig(
            doc,
            'paths',
            UPLOAD,
            verb,
            'requestBody',
            'content',
            'multipart/form-data',
            'schema',
          ),
        );
        const file = asObject(asObject(schema.properties).file);
        expect(file.type).toBe('string');
        expect(file.format).toBe('binary');
        expect(schema.required).toEqual(expect.arrayContaining(['file']));
      });
    }
  });

  describe('4xx surface is wired to the shared envelope by group', () => {
    it('host route (game/start, G3): 400/403/404/409 → $ref ApiErrorResponseDto', () => {
      const responses = asObject(
        dig(
          doc,
          'paths',
          `${API}/rooms/{code}/game/start`,
          'post',
          'responses',
        ),
      );
      for (const status of ['400', '403', '404', '409']) {
        expect(responses[status]).toBeDefined();
      }
      const ref = dig(
        responses,
        '403',
        'content',
        'application/json',
        'schema',
        '$ref',
      );
      expect(typeof ref).toBe('string');
      expect(ref as string).toMatch(/ApiErrorResponseDto$/);
    });

    it('public read (game/state, G1): 404 but not 401/403', () => {
      const responses = asObject(
        dig(doc, 'paths', `${API}/rooms/{code}/game/state`, 'get', 'responses'),
      );
      expect(responses['404']).toBeDefined();
      expect(responses['401']).toBeUndefined();
      expect(responses['403']).toBeUndefined();
    });

    it('upload (G6): 413', () => {
      const responses = asObject(
        dig(
          doc,
          'paths',
          `${API}/rooms/{code}/presentation/upload`,
          'post',
          'responses',
        ),
      );
      expect(responses['413']).toBeDefined();
    });

    it('player route (players/me, G4r): 401', () => {
      const responses = asObject(
        dig(doc, 'paths', `${API}/rooms/{code}/players/me`, 'get', 'responses'),
      );
      expect(responses['401']).toBeDefined();
    });
  });

  describe('deprecated game/finish stub', () => {
    it('is marked deprecated and keeps its 501', () => {
      const op = asObject(
        dig(doc, 'paths', `${API}/rooms/{code}/game/finish`, 'post'),
      );
      expect(op.deprecated).toBe(true);
      expect(asObject(op.responses)['501']).toBeDefined();
    });
  });
});
