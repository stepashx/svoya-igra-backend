/**
 * Swagger tag taxonomy. Tags mirror the compact feature areas (§6 master
 * context), never individual entities. Controllers attach `@ApiTags(...)`
 * using these constants so the docs stay grouped consistently as features land.
 */
export const SwaggerTag = {
  Health: 'Health',
  GameSession: 'Game Session',
  Gameplay: 'Gameplay',
  Commerce: 'Commerce',
  Presentation: 'Presentation',
  Evaluation: 'Evaluation',
  Realtime: 'Realtime',
} as const;

export type SwaggerTag = (typeof SwaggerTag)[keyof typeof SwaggerTag];

/** Ordered list used to register tags on the OpenAPI document. */
export const SWAGGER_TAGS: readonly SwaggerTag[] = Object.values(SwaggerTag);
