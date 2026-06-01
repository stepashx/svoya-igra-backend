import {
  REALTIME_JOIN_ROOM,
  REALTIME_LEAVE_ROOM,
  realtimeEventName,
} from './realtime-events.constants';

describe('realtime event naming', () => {
  it('builds direction:area:name', () => {
    expect(realtimeEventName('server', 'gameplay', 'question-opened')).toBe(
      'server:gameplay:question-opened',
    );
    expect(realtimeEventName('client', 'game-session', 'join-room')).toBe(
      'client:game-session:join-room',
    );
  });

  it('exposes the transport-level room commands', () => {
    expect(REALTIME_JOIN_ROOM).toBe('client:realtime:join-room');
    expect(REALTIME_LEAVE_ROOM).toBe('client:realtime:leave-room');
  });
});
