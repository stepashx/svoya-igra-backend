import { Inject, Injectable } from '@nestjs/common';
import { CLOCK_PORT, ClockPort } from '../../../core/ports/clock.port';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import { Room } from '../../domain/entities';
import { RoomNotFoundError } from '../../domain/errors';
import { ROOM_REPOSITORY_PORT, RoomRepositoryPort } from '../../domain/ports';
import { GameSessionEvent, roomSummary } from '../events';

export interface CloseRoomInput {
  roomId: string;
}

/**
 * Host-initiated room closure (plan §14.1, §15.1). The room's own status guard
 * (close-only-from-ACTIVE) rejects a double close with RoomNotActiveError;
 * broadcasts `room-closed`. The host token is verified by the route guard.
 */
@Injectable()
export class CloseRoomUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
  ) {}

  async execute(input: CloseRoomInput): Promise<Room> {
    const room = await this.rooms.findById(input.roomId);
    if (!room) {
      throw new RoomNotFoundError();
    }

    room.close(this.clock.now());
    await this.rooms.update(room);

    this.realtime.emitToRoom(room.id, GameSessionEvent.RoomClosed, {
      roomId: room.id,
      room: roomSummary(room),
    });

    return room;
  }
}
