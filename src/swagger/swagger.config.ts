import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { SWAGGER_TAGS } from './swagger.tags';

export interface SwaggerOptions {
  /** API version label (e.g. `v1`). */
  version: string;
  /** Global route prefix (e.g. `api`) so "Try it out" targets the right base. */
  apiPrefix: string;
}

const TITLE = 'Build Your Project Presentation — Backend API';
const DESCRIPTION = [
  'Backend-only API for the educational real-time multiplayer game.',
  'REST and WebSocket share one backend process/URL; this document covers the',
  'REST surface only — realtime event contracts are documented separately.',
  'Educational MVP scope: a single demo game room with few participants.',
].join(' ');

/**
 * Build the OpenAPI document config (title/description/version/tags) without an
 * app instance, so it is unit-testable. Tags follow the compact feature areas.
 */
export function buildSwaggerDocumentConfig(
  options: SwaggerOptions,
): Omit<OpenAPIObject, 'paths'> {
  const builder = new DocumentBuilder()
    .setTitle(TITLE)
    .setDescription(DESCRIPTION)
    .setVersion(options.version);

  const trimmedPrefix = options.apiPrefix.replace(/^\/+|\/+$/g, '');
  if (trimmedPrefix.length > 0) {
    builder.addServer(`/${trimmedPrefix}`);
  }

  for (const tag of SWAGGER_TAGS) {
    builder.addTag(tag);
  }

  return builder.build();
}

/**
 * Mount Swagger UI at the configured path. Centralized so future controllers
 * only add `@ApiTags`/response decorators — no per-feature bootstrap wiring.
 */
export function setupSwagger(
  app: INestApplication,
  path: string,
  options: SwaggerOptions,
): void {
  const config = buildSwaggerDocumentConfig(options);
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(path, app, document);
}
