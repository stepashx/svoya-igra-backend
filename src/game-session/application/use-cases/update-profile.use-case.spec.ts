import {
  InvalidPlayerNameError,
  PlayerNameTakenError,
  PlayerNotFoundError,
} from '../../domain/errors';
import { GameSessionEvent } from '../events';
import { UpdateProfileUseCase } from './update-profile.use-case';
import {
  makePlayer,
  makePlayerRepo,
  makeRealtime,
  makeRoom,
  makeRoomRepo,
} from './lobby-test-doubles';

describe('UpdateProfileUseCase', () => {
  const build = () => {
    const rooms = makeRoomRepo();
    const players = makePlayerRepo();
    const realtime = makeRealtime();
    rooms.findById.mockResolvedValue(makeRoom());
    players.findById.mockResolvedValue(makePlayer({ id: 'player-1' }));
    const uc = new UpdateProfileUseCase(rooms, players, realtime);
    return { uc, rooms, players, realtime };
  };

  it('renames the player and broadcasts the profile update', async () => {
    const { uc, players, realtime } = build();

    const player = await uc.execute({
      roomId: 'room-1',
      actingPlayerId: 'player-1',
      name: 'Renamed',
    });

    expect(player.name.value).toBe('Renamed');
    expect(players.update).toHaveBeenCalledWith(player);
    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      'room-1',
      GameSessionEvent.PlayerProfileUpdated,
      expect.objectContaining({ roomId: 'room-1' }),
    );
  });

  it('updates the avatar (and can clear it with null)', async () => {
    const { uc } = build();
    const player = await uc.execute({
      roomId: 'room-1',
      actingPlayerId: 'player-1',
      avatar: null,
    });
    expect(player.avatar).toBeNull();
  });

  it('rejects an invalid new name', async () => {
    const { uc } = build();
    await expect(
      uc.execute({ roomId: 'room-1', actingPlayerId: 'player-1', name: '  ' }),
    ).rejects.toBeInstanceOf(InvalidPlayerNameError);
  });

  it('propagates a duplicate-name violation from the repository', async () => {
    const { uc, players } = build();
    players.update.mockRejectedValue(new PlayerNameTakenError());
    await expect(
      uc.execute({
        roomId: 'room-1',
        actingPlayerId: 'player-1',
        name: 'Taken',
      }),
    ).rejects.toBeInstanceOf(PlayerNameTakenError);
  });

  it('rejects an unknown player', async () => {
    const { uc, players } = build();
    players.findById.mockResolvedValue(null);
    await expect(
      uc.execute({ roomId: 'room-1', actingPlayerId: 'x', name: 'A' }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });
});
