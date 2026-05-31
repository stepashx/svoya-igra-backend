import { buildSwaggerDocumentConfig } from './swagger.config';
import { SWAGGER_TAGS, SwaggerTag } from './swagger.tags';

describe('buildSwaggerDocumentConfig', () => {
  it('sets title, version, and feature-area tags', () => {
    const config = buildSwaggerDocumentConfig({
      version: 'v1',
      apiPrefix: 'api',
    });

    expect(config.info.title).toContain('Build Your Project Presentation');
    expect(config.info.version).toBe('v1');

    const tagNames = (config.tags ?? []).map((tag) => tag.name);
    expect(tagNames).toEqual([...SWAGGER_TAGS]);
    expect(tagNames).toContain(SwaggerTag.Health);
    expect(tagNames).not.toContain('rooms'); // tags are feature areas, not entities
  });

  it('registers the api-prefix server for "Try it out"', () => {
    const config = buildSwaggerDocumentConfig({
      version: 'v1',
      apiPrefix: 'api',
    });
    expect(config.servers?.map((s) => s.url)).toContain('/api');
  });

  it('omits the server when no api prefix is configured', () => {
    const config = buildSwaggerDocumentConfig({ version: 'v1', apiPrefix: '' });
    expect(config.servers ?? []).toHaveLength(0);
  });
});
