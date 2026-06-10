import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/http/all-exceptions.filter';
import { REALTIME_EVENTS_PORT } from '../../src/core/ports/realtime-events.port';

/** A room-wide event captured by the e2e RealtimeEventsPort stub. */
export interface CapturedEvent {
  roomId: string;
  event: string;
  payload: unknown;
}

export interface E2EApp {
  app: INestApplication;
  /** All room-wide events emitted since the last `events.length = 0`. */
  events: CapturedEvent[];
}

/**
 * Boots the real {@link AppModule} for e2e, configured exactly like `main.ts`
 * (global `/api` prefix, whitelist+transform ValidationPipe, AllExceptionsFilter).
 * The RealtimeEventsPort is replaced with an in-memory recorder so the REST
 * tests can assert room-wide emission without a live socket server (5.2b).
 *
 * `customize` lets a suite apply extra provider overrides before compile — e.g.
 * the battle-cycle suite swaps the AnswerTimerRegistry for a 1-second one so the
 * timeout path is testable in real time (the ANSWER_TIMER_SECONDS env cannot be
 * overridden per-suite: ConfigModule.forRoot evaluates at AppModule import time,
 * before any in-test mutation).
 */
export async function createE2EApp(
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<E2EApp> {
  const events: CapturedEvent[] = [];

  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(REALTIME_EVENTS_PORT)
    .useValue({
      emitToRoom: (roomId: string, event: string, payload: unknown) =>
        events.push({ roomId, event, payload }),
      emitToClient: () => undefined,
    });
  if (customize) {
    builder = customize(builder);
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  return { app, events };
}
