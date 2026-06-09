import {
  EventAudience,
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

  it('adds the originating-socket audience (5.2b) without renaming the rest', () => {
    expect(EventAudience.OriginatingSocket).toBe('originating-socket');
    // Existing audiences are unchanged.
    expect(EventAudience.Room).toBe('room');
    expect(EventAudience.Host).toBe('host');
    expect(EventAudience.Team).toBe('team');
    expect(EventAudience.Captain).toBe('captain');
  });
});
