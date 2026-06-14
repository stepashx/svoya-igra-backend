import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import { TeamRealtimeEventsPort } from '../../application/ports';
import {
  PLAYER_REPOSITORY_PORT,
  PlayerRepositoryPort,
} from '../../domain/ports';
import { LobbyPresenceRegistry } from './lobby-presence.registry';

/**
 * Team-socket delivery adapter (sub-stage 8.3). Implements the application
 * {@link TeamRealtimeEventsPort} by resolving the team's roster from the
 * {@link PlayerRepositoryPort}, reverse-looking-up each member's live sockets
 * in the {@link LobbyPresenceRegistry} (the 6.2b host pattern, mirrored), and
 * emitting to each through {@link RealtimeEventsPort.emitToClient}. Deliberately
 * NOT a transport team group: the base gateway's public `join-room` would let
 * any socket join such a group and read another team's QR `publicUrl`. With no
 * member socket present this is a no-op — the team reads its inventory over
 * the guarded REST surface (§15.9).
 *
 * The ENTIRE body is wrapped in try/catch and logged: delivery is best-effort
 * and runs AFTER the purchase commits, so a roster query or emit failure must
 * never propagate out and fail an already-committed purchase. Presence is
 * in-memory per process — single-node, like the registry itself.
 */
@Injectable()
export class PresenceTeamRealtimeEventsAdapter implements TeamRealtimeEventsPort {
  private readonly logger = new Logger(PresenceTeamRealtimeEventsAdapter.name);

  constructor(
    @Inject(PLAYER_REPOSITORY_PORT)
    private readonly players: PlayerRepositoryPort,
    private readonly presence: LobbyPresenceRegistry,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
  ) {}

  async emitToTeam(
    teamId: string,
    event: string,
    payload: unknown,
  ): Promise<void> {
    try {
      const members = await this.players.findByTeamId(teamId);
      for (const member of members) {
        for (const socketId of this.presence.socketsForPlayer(member.id)) {
          this.realtime.emitToClient(socketId, event, payload);
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to deliver ${event} to team ${teamId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
