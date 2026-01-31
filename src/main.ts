import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';

/**
 * PeerSync Dev Connect Backend
 * 
 * Production-ready WebSocket server for cross-IDE collaboration.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const configService = app.get(ConfigService);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      disableErrorMessages: configService.get<string>('NODE_ENV') === 'production',
    }),
  );

  // Native WebSocket adapter
  app.useWebSocketAdapter(new WsAdapter(app));

  // CORS for REST endpoints
  app.enableCors({
    origin: configService.get<string>('NODE_ENV') === 'production' ? false : true,
    credentials: true,
  });

  // API prefix
  app.setGlobalPrefix('api/v1');

  const port = configService.get<number>('PORT') || 3000;

  await app.listen(port);

  logger.log(`PeerSync backend running on port ${port}`);
  logger.log(`WebSocket: ws://localhost:${port}/ws`);
  logger.log(`Environment: ${configService.get<string>('NODE_ENV') || 'development'}`);
}

bootstrap().catch((error: Error) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to start', error.stack);
  process.exit(1);
});
