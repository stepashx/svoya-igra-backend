import { Player } from '../../domain/entities';

/** Host identity resolved by {@link HostAuthGuard} and attached to the request. */
export interface HostContext {
  roomId: string;
  hostId: string;
}

/**
 * The shape the lobby guards read from / write to on the HTTP request. The
 * guards validate the `:code` and token headers, then attach the resolved
 * principal (`player` or `host`) for the param decorators to surface.
 */
export interface LobbyRequest {
  params: Record<string, string | undefined>;
  headers: Record<string, string | string[] | undefined>;
  player?: Player;
  // Not `host`: Express defines `req.host` as a read-only getter.
  hostContext?: HostContext;
}
