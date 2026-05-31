import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, ServerOptions } from 'socket.io';
import { AppConfigService } from '../config/app-config.service';

/**
 * Socket.IO adapter that applies transport options (path, CORS origin) from the
 * typed config instead of decorator literals — keeps config centralized and out
 * of `process.env`. Wired in bootstrap via `app.useWebSocketAdapter(...)`.
 */
export class RealtimeIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly config: AppConfigService,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const ws = this.config.websocket;
    return super.createIOServer(port, {
      ...options,
      path: ws.path,
      cors: { origin: ws.corsOrigin },
    }) as Server;
  }
}
