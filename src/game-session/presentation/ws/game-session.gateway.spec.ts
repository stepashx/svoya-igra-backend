import { Socket } from 'socket.io';
import { ConnectionEvent, GameSessionEvent } from '../../application/events';
import { RoomAggregateSnapshot } from '../../application/queries';
import {
  MarkClientDisconnectedUseCase,
  ReconnectClientUseCase,
} from '../../application/use-cases';
import {
  makePlayer,
  makeRealtime,
  makeRoom,
  makeTeam,
} from '../../application/use-cases/lobby-test-doubles';
import { RoomNotFoundError } from '../../domain/errors';
import { toRoomStateResponse } from '../mappers';
import { GameSessionGateway } from './game-session.gateway';
import { LobbyPresenceRegistry } from './lobby-presence.registry';
import {
  ResolvedSocketIdentity,
  SocketIdentityResolver,
} from './socket-identity.resolver';

const snapshot = (): RoomAggregateSnapshot => ({
  room: makeRoom(),
  players: [makePlayer({ id: 'player-1' })],
  teams: [makeTeam()],
});

const playerIdentity: ResolvedSocketIdentity = {
  principal: 'player',
  roomId: 'room-1',
  playerId: 'player-1',
};
const hostIdentity: ResolvedSocketIdentity = {
  principal: 'host',
  roomId: 'room-1',
};

const makeSocket = (
  opts: {
    id?: string;
    auth?: Record<string, unknown>;
    query?: Record<string, unknown>;
  } = {},
): Socket =>
  ({
    id: opts.id ?? 'socket-1',
    join: jest.fn(),
    disconnect: jest.fn(),
    handshake: { auth: opts.auth ?? {}, query: opts.query ?? {} },
  }) as unknown as Socket;

describe('GameSessionGateway', () => {
  const build = () => {
    const resolver = {
      resolve: jest.fn(),
    } as unknown as jest.Mocked<SocketIdentityResolver>;
    const presence = new LobbyPresenceRegistry();
    const reconnectClient = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ReconnectClientUseCase>;
    const markDisconnected = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<MarkClientDisconnectedUseCase>;
    const realtime = makeRealtime();
    const gateway = new GameSessionGateway(
      resolver,
      presence,
      reconnectClient,
      markDisconnected,
      realtime,
    );
    return {
      gateway,
      resolver,
      presence,
      reconnectClient,
      markDisconnected,
      realtime,
    };
  };

  describe('handleConnection', () => {
    it('restores a player: joins, registers, returns connection-restored + room-state', async () => {
      const { gateway, resolver, reconnectClient, realtime, presence } =
        build();
      resolver.resolve.mockResolvedValue(playerIdentity);
      const snap = snapshot();
      reconnectClient.execute.mockResolvedValue(snap);
      const client = makeSocket({ auth: { reconnectToken: 'player-token' } });

      await gateway.handleConnection(client);

      expect(resolver.resolve).toHaveBeenCalledWith('player-token');
      expect(client.join).toHaveBeenCalledWith('room-1');
      expect(presence.has('socket-1')).toBe(true);
      expect(reconnectClient.execute).toHaveBeenCalledWith({
        roomId: 'room-1',
        principalHint: 'player',
        playerId: 'player-1',
      });
      expect(realtime.emitToClient).toHaveBeenCalledWith(
        'socket-1',
        ConnectionEvent.ConnectionRestored,
        { roomId: 'room-1', playerId: 'player-1' },
      );
      expect(realtime.emitToClient).toHaveBeenCalledWith(
        'socket-1',
        GameSessionEvent.RoomState,
        toRoomStateResponse(snap),
      );
    });

    it('restores the host: no playerId in the call, null playerId in the event', async () => {
      const { gateway, resolver, reconnectClient, realtime } = build();
      resolver.resolve.mockResolvedValue(hostIdentity);
      reconnectClient.execute.mockResolvedValue(snapshot());
      const client = makeSocket({ auth: { reconnectToken: 'host-token' } });

      await gateway.handleConnection(client);

      expect(reconnectClient.execute).toHaveBeenCalledWith({
        roomId: 'room-1',
        principalHint: 'host',
        playerId: undefined,
      });
      expect(realtime.emitToClient).toHaveBeenCalledWith(
        'socket-1',
        ConnectionEvent.ConnectionRestored,
        { roomId: 'room-1', playerId: null },
      );
    });

    it('reads the token from the query string when auth lacks it', async () => {
      const { gateway, resolver, reconnectClient } = build();
      resolver.resolve.mockResolvedValue(hostIdentity);
      reconnectClient.execute.mockResolvedValue(snapshot());
      const client = makeSocket({ query: { reconnectToken: 'from-query' } });

      await gateway.handleConnection(client);

      expect(resolver.resolve).toHaveBeenCalledWith('from-query');
    });

    it('rejects an unknown token with one error then disconnects, without registering', async () => {
      const { gateway, resolver, reconnectClient, realtime, presence } =
        build();
      resolver.resolve.mockResolvedValue(null);
      const client = makeSocket({ auth: { reconnectToken: 'bad' } });

      await gateway.handleConnection(client);

      expect(realtime.emitToClient).toHaveBeenCalledWith(
        'socket-1',
        GameSessionEvent.Error,
        { code: 'INVALID_RECONNECT_TOKEN', message: expect.any(String) },
      );
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(reconnectClient.execute).not.toHaveBeenCalled();
      expect(presence.has('socket-1')).toBe(false);
    });

    it('maps an AppError raised during reconnect to game-session:error', async () => {
      const { gateway, resolver, reconnectClient, realtime } = build();
      resolver.resolve.mockResolvedValue(playerIdentity);
      reconnectClient.execute.mockRejectedValue(new RoomNotFoundError());
      const client = makeSocket({ auth: { reconnectToken: 'player-token' } });

      await expect(gateway.handleConnection(client)).resolves.toBeUndefined();

      expect(realtime.emitToClient).toHaveBeenCalledWith(
        'socket-1',
        GameSessionEvent.Error,
        { code: 'ROOM_NOT_FOUND', message: expect.any(String) },
      );
    });

    it('collapses a non-AppError to a secret-free realtime:error', async () => {
      const { gateway, resolver, realtime } = build();
      resolver.resolve.mockRejectedValue(new Error('secret connstring leaked'));
      const client = makeSocket({ auth: { reconnectToken: 'player-token' } });

      await expect(gateway.handleConnection(client)).resolves.toBeUndefined();

      expect(realtime.emitToClient).toHaveBeenCalledWith(
        'socket-1',
        ConnectionEvent.Error,
        { code: 'INTERNAL_ERROR', message: 'Internal error' },
      );
    });
  });

  describe('handleDisconnect', () => {
    it('marks a player disconnected when their last socket drops', async () => {
      const { gateway, presence, markDisconnected } = build();
      presence.register('socket-1', playerIdentity);

      await gateway.handleDisconnect(makeSocket({ id: 'socket-1' }));

      expect(markDisconnected.execute).toHaveBeenCalledWith({
        roomId: 'room-1',
        playerId: 'player-1',
      });
      expect(presence.has('socket-1')).toBe(false);
    });

    it('does not mark disconnected while another tab is still open', async () => {
      const { gateway, presence, markDisconnected } = build();
      presence.register('socket-1', playerIdentity);
      presence.register('socket-2', playerIdentity);

      await gateway.handleDisconnect(makeSocket({ id: 'socket-1' }));

      expect(markDisconnected.execute).not.toHaveBeenCalled();
    });

    it('treats a host disconnect as cleanup-only — no event', async () => {
      const { gateway, presence, markDisconnected } = build();
      presence.register('socket-1', hostIdentity);

      await gateway.handleDisconnect(makeSocket({ id: 'socket-1' }));

      expect(markDisconnected.execute).not.toHaveBeenCalled();
      expect(presence.has('socket-1')).toBe(false);
    });

    it('ignores a disconnect for an unregistered socket', async () => {
      const { gateway, markDisconnected } = build();

      await expect(
        gateway.handleDisconnect(makeSocket({ id: 'ghost' })),
      ).resolves.toBeUndefined();
      expect(markDisconnected.execute).not.toHaveBeenCalled();
    });
  });
});
