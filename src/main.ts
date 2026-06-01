import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter';
import { setupSwagger } from './swagger/swagger.config';
import { RealtimeIoAdapter } from './realtime/realtime-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  const config = app.get(AppConfigService);

  app.setGlobalPrefix(config.app.apiPrefix);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({ origin: config.cors.frontendOrigin });
  app.useWebSocketAdapter(new RealtimeIoAdapter(app, config));

  setupSwagger(app, config.swagger.path, {
    version: config.app.apiVersion,
    apiPrefix: config.app.apiPrefix,
  });

  app.enableShutdownHooks();

  await app.listen(config.app.port);
  Logger.log(
    `Backend listening on port ${config.app.port} (prefix: /${config.app.apiPrefix}); ` +
      `Swagger at /${config.swagger.path}`,
    'Bootstrap',
  );
}

void bootstrap();
