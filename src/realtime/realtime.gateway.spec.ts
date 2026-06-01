import { Server, Socket } from 'socket.io';
import { RealtimeGateway } from './realtime.gateway';

describe('RealtimeGateway', () => {
  const makeGateway = () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    const gateway = new RealtimeGateway();
    (gateway as unknown as { server: Server }).server = {
      to,
    } as unknown as Server;
    return { gateway, to, emit };
  };

  const makeSocket = (overrides: Partial<Socket> = {}) =>
    ({
      id: 'socket-1',
      join: jest.fn(),
      leave: jest.fn(),
      handshake: { auth: {}, query: {} },
      ...overrides,
    }) as unknown as Socket;

  it('broadcasts to a room group via emitToRoom', () => {
    const { gateway, to, emit } = makeGateway();
    gateway.emitToRoom('room-42', 'server:realtime:ping', { n: 1 });
    expect(to).toHaveBeenCalledWith('room-42');
    expect(emit).toHaveBeenCalledWith('server:realtime:ping', { n: 1 });
  });

  it('sends to a single client via emitToClient', () => {
    const { gateway, to, emit } = makeGateway();
    gateway.emitToClient('socket-9', 'server:realtime:ping', 'hi');
    expect(to).toHaveBeenCalledWith('socket-9');
    expect(emit).toHaveBeenCalledWith('server:realtime:ping', 'hi');
  });

  it('joins a socket to a normalized room group', () => {
    const { gateway } = makeGateway();
    const client = makeSocket();
    const result = gateway.joinRoom(client, { roomId: '  room-7  ' });
    expect(client.join).toHaveBeenCalledWith('room-7');
    expect(result).toEqual({ joined: 'room-7' });
  });

  it('does not join when roomId is missing or blank', () => {
    const { gateway } = makeGateway();
    const client = makeSocket();
    const result = gateway.joinRoom(client, { roomId: '   ' });
    expect(client.join).not.toHaveBeenCalled();
    expect(result).toEqual({ joined: null });
  });

  it('leaves a room group', () => {
    const { gateway } = makeGateway();
    const client = makeSocket();
    const result = gateway.leaveRoom(client, { roomId: 'room-7' });
    expect(client.leave).toHaveBeenCalledWith('room-7');
    expect(result).toEqual({ left: 'room-7' });
  });

  it('handles connect/disconnect without touching business state', () => {
    const { gateway, to } = makeGateway();
    const client = makeSocket({
      handshake: { auth: { reconnectToken: 'tok' }, query: {} } as never,
    });
    expect(() => gateway.handleConnection(client)).not.toThrow();
    expect(() => gateway.handleDisconnect(client)).not.toThrow();
    // No broadcast / no room validation on lifecycle events.
    expect(to).not.toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });
});
