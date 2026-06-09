import { CreateRoomUseCase } from './create-room.use-case';
import {
  FIXED_NOW,
  makeClock,
  makeConfig,
  makeIdGenerator,
  makeRoomRepo,
  makeTokenGenerator,
} from './lobby-test-doubles';

describe('CreateRoomUseCase', () => {
  const build = () => {
    const rooms = makeRoomRepo();
    const uc = new CreateRoomUseCase(
      rooms,
      makeIdGenerator(),
      makeTokenGenerator('ABCDEF'),
      makeClock(),
      makeConfig(),
    );
    return { uc, rooms };
  };

  it('creates an ACTIVE room in LOBBY with a code and host token', async () => {
    const { uc, rooms } = build();
    const room = await uc.execute();

    expect(room.status).toBe('ACTIVE');
    expect(room.currentStage).toBe('LOBBY');
    expect(room.code.value).toBe('ABCDEF');
    expect(room.hostReconnectToken.value).toBe('token-1');
    expect(room.createdAt).toBe(FIXED_NOW);
    expect(rooms.create).toHaveBeenCalledTimes(1);
  });

  it('retries on a room-code unique violation', async () => {
    const { uc, rooms } = build();
    const collision = Object.assign(new Error('dup'), {
      code: '23505',
      constraint: 'rooms_code_uq',
    });
    rooms.create
      .mockRejectedValueOnce(collision)
      .mockResolvedValueOnce(undefined);

    await uc.execute();

    expect(rooms.create).toHaveBeenCalledTimes(2);
  });

  it('rethrows a non-collision error without retrying', async () => {
    const { uc, rooms } = build();
    rooms.create.mockRejectedValueOnce(new Error('db down'));

    await expect(uc.execute()).rejects.toThrow('db down');
    expect(rooms.create).toHaveBeenCalledTimes(1);
  });
});
