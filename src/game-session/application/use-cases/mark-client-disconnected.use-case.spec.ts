import { ConnectionEvent } from '../events';
import { MarkClientDisconnectedUseCase } from './mark-client-disconnected.use-case';
import {
  makeClock,
  makePlayer,
  makePlayerRepo,
  makeRealtime,
} from './lobby-test-doubles';

describe('MarkClientDisconnectedUseCase', () => {
  const build = () => {
    const players = makePlayerRepo();
    const realtime = makeRealtime();
    const uc = new MarkClientDisconnectedUseCase(
      players,
      makeClock(),
      realtime,
    );
    return { uc, players, realtime };
  };

  it('marks the player DISCONNECTED and broadcasts connection-lost room-wide', async () => {
    const { uc, players, realtime } = build();
    const player = makePlayer({
      id: 'player-1',
      connectionStatus: 'CONNECTED',
    });
    players.findById.mockResolvedValue(player);

    await uc.execute({ roomId: 'room-1', playerId: 'player-1' });

    expect(player.connectionStatus).toBe('DISCONNECTED');
    expect(players.update).toHaveBeenCalledWith(player);
    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      'room-1',
      ConnectionEvent.ConnectionLost,
      { roomId: 'room-1', playerId: 'player-1' },
    );
  });

  it('is a graceful no-op when the player is already gone', async () => {
    const { uc, players, realtime } = build();
    players.findById.mockResolvedValue(null);

    await expect(
      uc.execute({ roomId: 'room-1', playerId: 'ghost' }),
    ).resolves.toBeUndefined();
    expect(players.update).not.toHaveBeenCalled();
    expect(realtime.emitToRoom).not.toHaveBeenCalled();
  });
});
