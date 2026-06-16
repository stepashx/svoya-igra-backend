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

export interface FinishPresentationInput {
  roomId: string;
}

/**
 * The host marks the current presenter's defense FINISHED and advances the
 * queue (§10.16, §15.7). Legal only in PRESENTATION_DEFENSE. The progression is
 * entirely DERIVED — no defense table, no in-memory registry: the presenter is
 * `Room.currentTeamId`, the next one is {@link nextDefensePresenter} (turnOrder
 * ascending, NO wrap).
 *
 * `team-finished` (the current presenter) fires first. Then, if a next
 * presenter exists, the room points at it (`assignCurrentTeam` + `rooms.update`)
 * and `team-started` announces it; otherwise this was the LAST presenter, so the
 * room moves PRESENTATION_DEFENSE → EVALUATION (`transitionTo` + `rooms.update`)
 * and `finished` announces the next stage. The turn pointer is NOT advanced on
 * the final finish — defense is over, so the Result reports a null presenter.
 *
 * {@link SkipPresenterUseCase} is identical but for the leaving event
 * (`team-skipped`); the shared queue logic lives in {@link nextDefensePresenter}.
 * All broadcasts are room-wide and PUBLIC (no secret), in-transaction.
 */
@Injectable()
export class FinishPresentationUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(TEAM_REPOSITORY_PORT) private readonly teams: TeamRepositoryPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
    @Inject(TRANSACTION_PORT) private readonly tx: TransactionPort,
  ) {}

  async execute(input: FinishPresentationInput): Promise<DefenseAdvanceResult> {
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

      this.realtime.emitToRoom(room.id, DefenseEvent.TeamFinished, {
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
