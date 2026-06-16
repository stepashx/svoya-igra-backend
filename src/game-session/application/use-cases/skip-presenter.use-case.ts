import { Inject, Injectable } from '@nestjs/common';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import { UnexpectedGameStageError } from '../../../gameplay/domain/errors';
import { RoomNotActiveError, RoomNotFoundError } from '../../domain/errors';
import {
  ROOM_REPOSITORY_PORT,
  RoomRepositoryPort,
  TEAM_REPOSITORY_PORT,
  TeamRepositoryPort,
} from '../../domain/ports';
import { DefenseEvent } from '../events';
import { TRANSACTION_PORT, TransactionPort } from '../ports';
import { DefenseAdvanceResult, nextDefensePresenter } from './defense-advance';

export interface SkipPresenterInput {
  roomId: string;
}

/**
 * The host SKIPS the current presenter and advances the queue (§10.16, §15.7).
 * Byte-for-byte the same flow as {@link FinishPresentationUseCase} — same stage
 * guard, same {@link nextDefensePresenter} advance (turnOrder ascending, no
 * wrap), same DEFENSE → EVALUATION exit on the last presenter — with the SINGLE
 * difference that the current presenter leaves via `team-skipped` instead of
 * `team-finished`. The shared queue logic is {@link nextDefensePresenter}; all
 * broadcasts are room-wide and PUBLIC, in-transaction.
 */
@Injectable()
export class SkipPresenterUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(TEAM_REPOSITORY_PORT) private readonly teams: TeamRepositoryPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
    @Inject(TRANSACTION_PORT) private readonly tx: TransactionPort,
  ) {}

  async execute(input: SkipPresenterInput): Promise<DefenseAdvanceResult> {
    return this.tx.run(async () => {
      await this.rooms.acquireRoomLock(input.roomId);

      const room = await this.rooms.findById(input.roomId);
      if (!room) {
        throw new RoomNotFoundError();
      }
      if (room.status !== 'ACTIVE') {
        throw new RoomNotActiveError();
      }
      if (room.currentStage !== 'PRESENTATION_DEFENSE') {
        throw new UnexpectedGameStageError();
      }

      this.realtime.emitToRoom(room.id, DefenseEvent.TeamSkipped, {
        roomId: room.id,
        teamId: room.currentTeamId,
      });

      const roomTeams = await this.teams.findByRoomId(room.id);
      const next = nextDefensePresenter(room, roomTeams);
      if (next) {
        room.assignCurrentTeam(next.id);
        await this.rooms.update(room);
        this.realtime.emitToRoom(room.id, DefenseEvent.TeamStarted, {
          roomId: room.id,
          teamId: next.id,
        });
        return {
          stage: room.currentStage,
          currentPresenterTeamId: next.id,
          finished: false,
        };
      }

      room.transitionTo('EVALUATION');
      await this.rooms.update(room);
      this.realtime.emitToRoom(room.id, DefenseEvent.Finished, {
        roomId: room.id,
        nextStage: room.currentStage,
      });
      return {
        stage: room.currentStage,
        currentPresenterTeamId: null,
        finished: true,
      };
    });
  }
}
