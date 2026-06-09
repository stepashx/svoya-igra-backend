import { Inject, Injectable } from '@nestjs/common';
import { CLOCK_PORT, ClockPort } from '../../../core/ports/clock.port';
import {
  ID_GENERATOR_PORT,
  IdGeneratorPort,
} from '../../../core/ports/id-generator.port';
import {
  TOKEN_GENERATOR_PORT,
  TokenGeneratorPort,
} from '../../../core/ports/token-generator.port';
import { AppConfigService } from '../../../config/app-config.service';
import { Room } from '../../domain/entities';
import { ROOM_REPOSITORY_PORT, RoomRepositoryPort } from '../../domain/ports';
import { ReconnectToken, RoomCode } from '../../domain/value-objects';
import { isRoomCodeUniqueViolation } from '../../infrastructure/persistence/pg-error.util';

/**
 * Create a room (plan §14.1, §15.1). The host gets a freshly generated identity
 * and reconnect token plus a unique, human-enterable room code. Room-code
 * generation races are resolved by retrying on the `rooms_code_uq` violation
 * (the repository re-throws it unchanged as the retry signal).
 */
@Injectable()
export class CreateRoomUseCase {
  private static readonly MAX_CODE_ATTEMPTS = 5;

  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(ID_GENERATOR_PORT) private readonly ids: IdGeneratorPort,
    @Inject(TOKEN_GENERATOR_PORT) private readonly tokens: TokenGeneratorPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    private readonly config: AppConfigService,
  ) {}

  async execute(): Promise<Room> {
    const now = this.clock.now();
    const hostId = this.ids.generate();
    const hostReconnectToken = ReconnectToken.create(
      this.tokens.generateToken(),
    );
    const codeLength = this.config.reconnect.roomCodeLength;

    for (
      let attempt = 1;
      attempt <= CreateRoomUseCase.MAX_CODE_ATTEMPTS;
      attempt += 1
    ) {
      const room = Room.create(
        {
          id: this.ids.generate(),
          code: RoomCode.create(this.tokens.generateRoomCode(codeLength)),
          hostId,
          hostReconnectToken,
        },
        now,
      );
      try {
        await this.rooms.create(room);
        return room;
      } catch (error) {
        const lastAttempt = attempt === CreateRoomUseCase.MAX_CODE_ATTEMPTS;
        if (!isRoomCodeUniqueViolation(error) || lastAttempt) {
          throw error;
        }
      }
    }

    // Unreachable: the loop returns or throws on the final attempt.
    throw new Error('Failed to allocate a unique room code.');
  }
}
