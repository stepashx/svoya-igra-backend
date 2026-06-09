import { DomainRuleError } from '../../../core/errors/app.error';
import {
  CaptainCannotLeaveError,
  RoomNotActiveError,
  TeamNotFoundError,
} from '../../domain/errors';
import { GameSessionEvent } from '../events';
import { LeaveTeamUseCase } from './leave-team.use-case';
import {
  makePlayer,
  makePlayerRepo,
  makeRealtime,
  makeRoom,
  makeRoomRepo,
  makeTeam,
  makeTeamRepo,
} from './lobby-test-doubles';

describe('LeaveTeamUseCase', () => {
  const build = () => {
    const rooms = makeRoomRepo();
    const teams = makeTeamRepo();
    const players = makePlayerRepo();
    const realtime = makeRealtime();
    rooms.findById.mockResolvedValue(makeRoom());
    teams.findById.mockResolvedValue(
      makeTeam({ id: 'team-1', captainPlayerId: 'captain-1' }),
    );
    players.findById.mockResolvedValue(
      makePlayer({ id: 'player-2', teamId: 'team-1', isCaptain: false }),
    );
    const uc = new LeaveTeamUseCase(rooms, teams, players, realtime);
    return { uc, rooms, teams, players, realtime };
  };

  const input = {
    roomId: 'room-1',
    teamId: 'team-1',
    actingPlayerId: 'player-2',
  };

  it('lets a plain member leave and broadcasts team-updated', async () => {
    const { uc, players, realtime } = build();

    const player = await uc.execute(input);

    expect(player.teamId).toBeNull();
    expect(players.update).toHaveBeenCalledWith(player);
    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      'room-1',
      GameSessionEvent.TeamUpdated,
      expect.objectContaining({ roomId: 'room-1', teamId: 'team-1' }),
    );
  });

  it('forbids the captain from leaving with a specific CaptainCannotLeaveError', async () => {
    const { uc, players } = build();
    players.findById.mockResolvedValue(
      makePlayer({ id: 'captain-1', teamId: 'team-1', isCaptain: true }),
    );

    const error: unknown = await uc.execute(input).catch((e: unknown) => e);

    // Still a DomainRuleError (→ 409) so the existing contract holds, now with a
    // stable, machine-readable code.
    expect(error).toBeInstanceOf(DomainRuleError);
    expect(error).toBeInstanceOf(CaptainCannotLeaveError);
    expect((error as CaptainCannotLeaveError).code).toBe(
      'CAPTAIN_CANNOT_LEAVE',
    );
  });

  it('rejects leaving a team the player is not on', async () => {
    const { uc, players } = build();
    players.findById.mockResolvedValue(
      makePlayer({ id: 'player-2', teamId: 'team-9' }),
    );
    await expect(uc.execute(input)).rejects.toBeInstanceOf(TeamNotFoundError);
  });

  it('rejects leaving in a closed room', async () => {
    const { uc, rooms } = build();
    rooms.findById.mockResolvedValue(makeRoom({ status: 'CLOSED' }));
    await expect(uc.execute(input)).rejects.toBeInstanceOf(RoomNotActiveError);
  });
});
