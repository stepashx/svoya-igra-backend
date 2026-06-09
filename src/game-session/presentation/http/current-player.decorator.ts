import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { Player } from '../../domain/entities';
import { LobbyRequest } from './request-context';

/**
 * Injects the {@link Player} resolved by {@link PlayerIdentityGuard}. Use only
 * on routes protected by that guard — it throws if the guard did not run.
 */
export const CurrentPlayer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Player => {
    const request = ctx.switchToHttp().getRequest<LobbyRequest>();
    if (!request.player) {
      throw new InternalServerErrorException(
        'CurrentPlayer used without PlayerIdentityGuard.',
      );
    }
    return request.player;
  },
);
