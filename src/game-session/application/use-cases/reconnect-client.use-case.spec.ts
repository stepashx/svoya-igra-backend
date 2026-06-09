import { PlayerNotFoundError, RoomNotFoundError } from '../../domain/errors';
import { GameSessionEvent } from '../events';
import { RoomSnapshotAssembler } from '../queries/room-snapshot.assembler';
import { ReconnectClientUseCase } from './reconnect-client.use-case';
import {
  makeClock,
  makePlayer,
  makePlayerRepo,
  makeRealtime,
  makeRoom,
  makeRoomRepo,
  makeTeamRepo,
} from './lobby-test-doubles';

describe('ReconnectClientUseCase', () => {
  const build = () => {
    const rooms = makeRoomRepo();
    const players = makePlayerRepo();
    const teams = makeTeamRepo();
    const realtime = makeRealtime();
    const assembler = new RoomSnapshotAssembler(players, teams);
    const uc = new ReconnectClientUseCase(
      rooms,
      players,
      makeClock(),
      realtime,
      assembler,
    );
    return { uc, rooms, players, realtime };
  };

  it('marks the player connected and broadcasts client-reconnected', async () => {
    const { uc, rooms, players, realtime } = build();
    rooms.findById.mockResolvedValue(makeRoom());
    const player = makePlayer({ connectionStatus: 'DISCONNECTED' });
    players.findById.mockResolvedValue(player);

    const snapshot = await uc.execute({
      roomId: 'room-1',
      principalHint: 'player',
      playerId: 'player-1',
    });

    expect(player.connectionStatus).toBe('CONNECTED');
    expect(players.update).toHaveBeenCalledWith(player);
    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      'room-1',
      GameSessionEvent.ClientReconnected,
      expect.objectContaining({ roomId: 'room-1' }),
    );
    expect(snapshot.room.id).toBe('room-1');
  });

  it('broadcasts host-reconnected for the host principal', async () => {
    const { uc, rooms, players, realtime } = build();
    rooms.findById.mockResolvedValue(makeRoom());

    await uc.execute({ roomId: 'room-1', principalHint: 'host' });

    expect(players.update).not.toHaveBeenCalled();
    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      'room-1',
      GameSessionEvent.HostReconnected,
      expect.objectContaining({ roomId: 'room-1', hostId: 'host-1' }),
    );
  });

  it('rejects an unknown room', async () => {
    const { uc, rooms } = build();
    rooms.findById.mockResolvedValue(null);
    await expect(
      uc.execute({ roomId: 'room-1', principalHint: 'host' }),
    ).rejects.toBeInstanceOf(RoomNotFoundError);
  });

  it('rejects a player principal that cannot be resolved', async () => {
    const { uc, rooms, players } = build();
    rooms.findById.mockResolvedValue(makeRoom());
    players.findById.mockResolvedValue(null);
    await expect(
      uc.execute({ roomId: 'room-1', principalHint: 'player', playerId: 'x' }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });
});
