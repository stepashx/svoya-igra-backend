import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  const config = app.get(AppConfigService);

  app.setGlobalPrefix(config.app.apiPrefix);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: config.cors.frontendOrigin });
  app.enableShutdownHooks();

  await app.listen(config.app.port);
  Logger.log(
    `Backend listening on port ${config.app.port} (prefix: /${config.app.apiPrefix})`,
    'Bootstrap',
  );
}

void bootstrap();
