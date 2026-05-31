import { Module } from '@nestjs/common';

/**
 * Realtime transport shell (Stage 3A placeholder).
 *
 * Reserved location for the WebSocket gateway implementing RealtimeEventsPort
 * (transport only). The base gateway, room-grouping, naming convention, and
 * reconnect seam arrive in a later Stage 3 prompt. No game events here.
 */
@Module({})
export class RealtimeModule {}
