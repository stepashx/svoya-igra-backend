import {
  NotTeamCaptainError,
  RoomNotActiveError,
  TeamNotFoundError,
} from '../../domain/errors';
import { GameSessionEvent } from '../events';
import { MarkTeamReadyUseCase } from './mark-team-ready.use-case';
import {
  makeConfig,
  makeRealtime,
  makeRoom,
  makeRoomRepo,
  makeTeam,
  makeTeamRepo,
} from './lobby-test-doubles';

const emittedEvents = (realtime: ReturnType<typeof makeRealtime>): string[] =>
  realtime.emitToRoom.mock.calls.map((call) => call[1]);

const payloadFor = (
  realtime: ReturnType<typeof makeRealtime>,
  event: string,
): Record<string, unknown> =>
  realtime.emitToRoom.mock.calls.find(
    (call) => call[1] === event,
  )?.[2] as Record<string, unknown>;

describe('MarkTeamReadyUseCase', () => {
  const build = () => {
    const rooms = makeRoomRepo();
    const teams = makeTeamRepo();
    const realtime = makeRealtime();
    const room = makeRoom({ currentStage: 'TEAM_SETUP' });
    rooms.findById.mockResolvedValue(room);
    teams.findById.mockResolvedValue(
      makeTeam({ id: 'team-1', captainPlayerId: 'captain-1' }),
    );
    const uc = new MarkTeamReadyUseCase(rooms, teams, realtime, makeConfig());
    return { uc, rooms, teams, realtime, room };
  };

  const input = {
    roomId: 'room-1',
    teamId: 'team-1',
    actingPlayerId: 'captain-1',
    isReady: true,
  };

  it('advances TEAM_SETUP → READY_CHECK when the ready threshold is reached', async () => {
    const { uc, rooms, teams, realtime, room } = build();
    teams.findByRoomId.mockResolvedValue([
      makeTeam({ id: 'team-1', isReady: true }),
      makeTeam({ id: 'team-2', isReady: true }),
    ]);

    await uc.execute(input);

    expect(room.currentStage).toBe('READY_CHECK');
    expect(rooms.update).toHaveBeenCalledWith(room);
    expect(
      payloadFor(realtime, GameSessionEvent.GameCanStartChanged),
    ).toMatchObject({ canStart: true });
    expect(emittedEvents(realtime)).toEqual([
      GameSessionEvent.TeamReadyChanged,
      GameSessionEvent.GameCanStartChanged,
      GameSessionEvent.GameStageChanged,
    ]);
  });

  it('does not advance the stage below the threshold', async () => {
    const { uc, rooms, teams, realtime, room } = build();
    teams.findByRoomId.mockResolvedValue([
      makeTeam({ id: 'team-1', isReady: true }),
    ]);

    await uc.execute(input);

    expect(room.currentStage).toBe('TEAM_SETUP');
    expect(rooms.update).not.toHaveBeenCalled();
    expect(
      payloadFor(realtime, GameSessionEvent.GameCanStartChanged),
    ).toMatchObject({ canStart: false });
    expect(emittedEvents(realtime)).toEqual([
      GameSessionEvent.TeamReadyChanged,
      GameSessionEvent.GameCanStartChanged,
    ]);
  });

  it('forbids a non-captain from toggling readiness', async () => {
    const { uc } = build();
    await expect(
      uc.execute({ ...input, actingPlayerId: 'someone-else' }),
    ).rejects.toBeInstanceOf(NotTeamCaptainError);
  });

  it('rejects an unknown team', async () => {
    const { uc, teams } = build();
    teams.findById.mockResolvedValue(null);
    await expect(uc.execute(input)).rejects.toBeInstanceOf(TeamNotFoundError);
  });

  it('rejects toggling readiness in a closed room', async () => {
    const { uc, rooms } = build();
    rooms.findById.mockResolvedValue(makeRoom({ status: 'CLOSED' }));
    await expect(uc.execute(input)).rejects.toBeInstanceOf(RoomNotActiveError);
  });
});
