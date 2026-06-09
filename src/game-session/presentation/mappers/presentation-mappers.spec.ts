import {
  makePlayer,
  makeRoom,
  makeTeam,
  makeTopic,
} from '../../application/use-cases/lobby-test-doubles';
import {
  toCreateRoomResponse,
  toPlayerIdentityResponse,
  toPlayerResponse,
  toRoomResponse,
  toRoomStateResponse,
  toTeamResponse,
  toTopicResponse,
} from './index';

describe('presentation mappers', () => {
  it('maps a room without leaking the host token; dates become ISO strings', () => {
    const dto = toRoomResponse(makeRoom());
    expect(dto.code).toBe('ABCDEF');
    expect(dto.createdAt).toBe('2026-06-09T12:00:00.000Z');
    expect(dto.finishedAt).toBeNull();
    expect(dto).not.toHaveProperty('hostReconnectToken');
  });

  it('exposes the host token only on the create-room response', () => {
    const dto = toCreateRoomResponse(makeRoom());
    expect(dto.hostId).toBe('host-1');
    expect(dto.hostReconnectToken).toBe('host-token');
    expect(dto.room).not.toHaveProperty('hostReconnectToken');
  });

  it('maps a player without leaking the reconnect token', () => {
    const dto = toPlayerResponse(makePlayer({ isCaptain: true }));
    expect(dto.name).toBe('Ann');
    expect(dto.isCaptain).toBe(true);
    expect(dto).not.toHaveProperty('reconnectToken');
  });

  it('exposes the reconnect token only on the identity response', () => {
    const dto = toPlayerIdentityResponse(makePlayer());
    expect(dto.reconnectToken).toBe('player-token');
    expect(dto.player).not.toHaveProperty('reconnectToken');
  });

  it('unwraps team score value objects to primitives', () => {
    const dto = toTeamResponse(makeTeam({ turnOrder: 2 }));
    expect(dto.earnedScore).toBe(0);
    expect(dto.balance).toBe(0);
    expect(dto.turnOrder).toBe(2);
  });

  it('maps a topic and a full room-state snapshot', () => {
    expect(toTopicResponse(makeTopic('t1', 'History'))).toEqual({
      id: 't1',
      title: 'History',
      description: null,
    });
    const state = toRoomStateResponse({
      room: makeRoom(),
      players: [makePlayer(), makePlayer({ id: 'p2' })],
      teams: [makeTeam()],
    });
    expect(state.players).toHaveLength(2);
    expect(state.teams).toHaveLength(1);
    expect(state.room.code).toBe('ABCDEF');
  });
});
