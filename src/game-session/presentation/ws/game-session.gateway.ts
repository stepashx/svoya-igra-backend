import { Inject, Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import { ConnectionEvent, GameSessionEvent } from '../../application/events';
import {
  MarkClientDisconnectedUseCase,
  ReconnectClientUseCase,
} from '../../application/use-cases';
import { toRoomStateResponse } from '../mappers';
import { readReconnectToken } from './handshake';
import { LobbyPresenceRegistry } from './lobby-presence.registry';
import { SocketIdentityResolver } from './socket-identity.resolver';
import { toWsError } from './ws-error';

/**
 * Game-session WebSocket gateway (sub-stage 5.2b). A second `@WebSocketGateway()`
 * with no namespace, it attaches to the SAME Socket.IO server as the
 * transport-only {@link RealtimeGateway} (verified: both gateways' lifecycle
 * hooks fire). It never injects `@WebSocketServer()`: sockets are grouped with
 * `client.join` and every emission goes through {@link RealtimeEventsPort}, so
 * the layer stays transport-agnostic.
 *
 * Responsibility is presence + reconnect snapshot only — there are NO incoming
 * `client:game-session:*` command handlers; game mutations stay REST. On
 * handshake it identifies the socket from its reconnect token, restores the
 * principal via the unchanged {@link ReconnectClientUseCase} (which emits the
 * room-wide `client/host-reconnected`), and returns `connection-restored` +
 * `room-state` to the originating socket.
 */
@WebSocketGateway()
export class GameSessionGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(GameSessionGateway.name);

  constructor(
    private readonly resolver: SocketIdentityResolver,
    private readonly presence: LobbyPresenceRegistry,
    private readonly reconnectClient: ReconnectClientUseCase,
    private readonly markDisconnected: MarkClientDisconnectedUseCase,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    // Nest does not await this hook, so the WHOLE body is guarded: a failure
    // becomes an originating-socket error emission, never an unhandled rejection.
    try {
      const identity = await this.resolver.resolve(readReconnectToken(client));
      if (!identity) {
        this.realtime.emitToClient(client.id, GameSessionEvent.Error, {
          code: 'INVALID_RECONNECT_TOKEN',
          message: 'Invalid or unknown reconnect token.',
        });
        client.disconnect(true);
        return;
      }

      client.join(identity.roomId);
      this.presence.register(client.id, identity);

      // ReconnectClient is reused unchanged: it applies the reconnect side
      // effects, emits the room-wide client/host-reconnected, and returns the
      // snapshot this gateway forwards to the originating socket.
      const snapshot = await this.reconnectClient.execute({
        roomId: identity.roomId,
        principalHint: identity.principal,
        playerId:
          identity.principal === 'player' ? identity.playerId : undefined,
      });

      this.realtime.emitToClient(
        client.id,
        ConnectionEvent.ConnectionRestored,
        {
          roomId: identity.roomId,
          playerId: identity.principal === 'player' ? identity.playerId : null,
        },
      );
      this.realtime.emitToClient(
        client.id,
        GameSessionEvent.RoomState,
        toRoomStateResponse(snapshot),
      );
    } catch (error) {
      const { event, payload } = toWsError(error);
      this.realtime.emitToClient(client.id, event, payload);
      this.logger.error(
        `Reconnect handshake failed for socket ${client.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    // Guarded for the same reason; a disconnect must never throw.
    try {
      const { entry, lastForIdentity } = this.presence.unregister(client.id);
      if (!entry) {
        return;
      }
      const { identity } = entry;

      // Host drop is cleanup-only — no event; the room outlives a host reload
      // (§14.1). A player is marked DISCONNECTED only when the last tab closes.
      if (identity.principal === 'player' && lastForIdentity) {
        await this.markDisconnected.execute({
          roomId: identity.roomId,
          playerId: identity.playerId,
        });
      }
    } catch (error) {
      this.logger.error(
        `Disconnect handling failed for socket ${client.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
