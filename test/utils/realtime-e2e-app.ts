import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'net';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/http/all-exceptions.filter';
import { AppConfigService } from '../../src/config/app-config.service';
import { RealtimeIoAdapter } from '../../src/realtime/realtime-io.adapter';

export interface RealtimeE2EApp {
  app: INestApplication;
  /** Ephemeral port the HTTP + WebSocket server is listening on. */
  port: number;
  /** Socket.IO path from config — clients must use it to connect. */
  wsPath: string;
}

/**
 * Boots the real {@link AppModule} for realtime e2e — configured like `main.ts`
 * AND with the live Socket.IO transport (the {@link RealtimeIoAdapter}).
 *
 * Unlike {@link createE2EApp}, it does NOT override `REALTIME_EVENTS_PORT`:
 * events flow over real sockets via the actual gateways, so a socket.io-client
 * can observe the originating-socket (`room-state`, `connection-restored`,
 * `error`) and room-wide (`connection-lost`, `client/host-reconnected`)
 * emissions. Listens on an ephemeral port (0); REST helpers still work against
 * the same `app.getHttpServer()`.
 */
export async function createRealtimeE2EApp(): Promise<RealtimeE2EApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());

  const config = app.get(AppConfigService);
  app.useWebSocketAdapter(new RealtimeIoAdapter(app, config));

  await app.listen(0);

  const port = (app.getHttpServer().address() as AddressInfo).port;
  return { app, port, wsPath: config.websocket.path };
}
