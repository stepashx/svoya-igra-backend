import { Inject, Injectable } from '@nestjs/common';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import { HostRealtimeEventsPort } from '../../application/ports';
import { LobbyPresenceRegistry } from './lobby-presence.registry';

/**
 * Host-socket delivery adapter (sub-stage 6.2b). Implements the application
 * {@link HostRealtimeEventsPort} by reverse-looking-up the host's live sockets
 * in the {@link LobbyPresenceRegistry} (populated by the GameSessionGateway
 * handshake since 5.2b) and emitting to each through
 * {@link RealtimeEventsPort.emitToClient}. Deliberately NOT a transport host
 * group: the base gateway's public `join-room` would let any socket join such
 * a group and read host secrets. With no host socket present this is a no-op.
 * Presence is in-memory per process — single-node, like the registry itself.
 */
@Injectable()
export class PresenceHostRealtimeEventsAdapter implements HostRealtimeEventsPort {
  constructor(
    private readonly presence: LobbyPresenceRegistry,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
  ) {}

  emitToHost(roomId: string, event: string, payload: unknown): void {
    for (const socketId of this.presence.socketsForHost(roomId)) {
      this.realtime.emitToClient(socketId, event, payload);
    }
  }
}
