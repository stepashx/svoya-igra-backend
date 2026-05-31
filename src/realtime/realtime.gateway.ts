import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RealtimeEventsPort } from '../core/ports/realtime-events.port';
import {
  REALTIME_JOIN_ROOM,
  REALTIME_LEAVE_ROOM,
} from './realtime-events.constants';

/**
 * Base WebSocket gateway: pure transport. It manages the connection lifecycle
 * and socket-room grouping and implements {@link RealtimeEventsPort} so the
 * application layer can broadcast without knowing about Socket.IO. It holds NO
 * business logic — no room/membership validation, no DB access, no game events.
 * Transport options (path, CORS) come from config via the custom IO adapter.
 */
@WebSocketGateway()
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, RealtimeEventsPort
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  handleConnection(client: Socket): void {
    // Reconnect seam (Stage 5B): a reconnect token may arrive via handshake
    // auth/query and will later be passed to the ReconnectClient use case. No
    // validation, DB access, or state restoration happens at the transport layer.
    void this.readReconnectToken(client);
    this.logger.debug(`Socket connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Socket disconnected: ${client.id}`);
  }

  @SubscribeMessage(REALTIME_JOIN_ROOM)
  joinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { roomId?: string },
  ): { joined: string | null } {
    const roomId = normalizeRoomId(body?.roomId);
    if (roomId !== null) {
      // Transport grouping only — room existence/membership is NOT validated.
      client.join(roomId);
    }
    return { joined: roomId };
  }

  @SubscribeMessage(REALTIME_LEAVE_ROOM)
  leaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { roomId?: string },
  ): { left: string | null } {
    const roomId = normalizeRoomId(body?.roomId);
    if (roomId !== null) {
      client.leave(roomId);
    }
    return { left: roomId };
  }

  emitToRoom(roomId: string, event: string, payload: unknown): void {
    this.server.to(roomId).emit(event, payload);
  }

  emitToClient(clientId: string, event: string, payload: unknown): void {
    // Each socket auto-joins a room named by its id, so addressing the id works.
    this.server.to(clientId).emit(event, payload);
  }

  /** Read a reconnect token from the handshake. Placeholder — see Stage 5B. */
  private readReconnectToken(client: Socket): string | undefined {
    const fromAuth = (client.handshake.auth as { reconnectToken?: unknown })
      ?.reconnectToken;
    if (typeof fromAuth === 'string') {
      return fromAuth;
    }
    const fromQuery = client.handshake.query?.reconnectToken;
    return typeof fromQuery === 'string' ? fromQuery : undefined;
  }
}

/** Trim a room id and reject empty/non-string values. Transport-level only. */
function normalizeRoomId(roomId: unknown): string | null {
  if (typeof roomId !== 'string') {
    return null;
  }
  const trimmed = roomId.trim();
  return trimmed.length > 0 ? trimmed : null;
}
