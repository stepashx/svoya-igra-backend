import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { HostContext, LobbyRequest } from './request-context';

/**
 * Injects the {@link HostContext} resolved by {@link HostAuthGuard}. Use only on
 * routes protected by that guard — it throws if the guard did not run.
 */
export const CurrentHost = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): HostContext => {
    const request = ctx.switchToHttp().getRequest<LobbyRequest>();
    if (!request.hostContext) {
      throw new InternalServerErrorException(
        'CurrentHost used without HostAuthGuard.',
      );
    }
    return request.hostContext;
  },
);
