import { Module } from '@nestjs/common';
import { REALTIME_EVENTS_PORT } from '../core/ports/realtime-events.port';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Realtime transport area. Provides the base WebSocket gateway and binds it as
 * the RealtimeEventsPort implementation so future application code can broadcast
 * through the port (never the gateway directly). Transport only — no game events.
 */
@Module({
  providers: [
    RealtimeGateway,
    { provide: REALTIME_EVENTS_PORT, useExisting: RealtimeGateway },
  ],
  exports: [REALTIME_EVENTS_PORT],
})
export class RealtimeModule {}
