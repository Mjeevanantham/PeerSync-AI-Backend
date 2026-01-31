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

  // ═══════════════════════════════════════════════════════════════════════════════
  // PRODUCTION HARDENING: Process-level error handlers
  // Ensures unhandled errors are logged before process exits
  // ═══════════════════════════════════════════════════════════════════════════════
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled Promise Rejection:', reason);
  });

  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception:', error.message);
    logger.error(error.stack);
    process.exit(1);
  });
  // ═══════════════════════════════════════════════════════════════════════════════

  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === 'production' 
      ? ['error', 'warn', 'log'] 
      : ['error', 'warn', 'log', 'debug'],
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
  const corsOrigin = configService.get<string>('CORS_ORIGIN');
  app.enableCors({
    origin: corsOrigin 
      ? corsOrigin.split(',').map(o => o.trim()) 
      : (configService.get<string>('NODE_ENV') === 'production' ? false : true),
    credentials: true,
  });

  // API prefix (exclude health endpoints for Railway compatibility)
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/ready'],
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // PRODUCTION HARDENING: Graceful shutdown
  // Allows in-flight requests to complete before shutting down
  // ═══════════════════════════════════════════════════════════════════════════════
  app.enableShutdownHooks();
  // ═══════════════════════════════════════════════════════════════════════════════

  const port = configService.get<number>('PORT') || 3000;

  await app.listen(port, '0.0.0.0'); // Bind to all interfaces for Railway

  const nodeEnv = configService.get<string>('NODE_ENV') || 'development';
  logger.log(`🚀 PeerSync backend running on port ${port}`);
  logger.log(`🔌 WebSocket endpoint: /ws`);
  logger.log(`🌍 Environment: ${nodeEnv}`);
  
  if (nodeEnv !== 'production') {
    logger.log(`📍 Local URL: http://localhost:${port}`);
    logger.log(`📍 WebSocket: ws://localhost:${port}/ws`);
  }
}

bootstrap().catch((error: Error) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to start application');
  logger.error(error.message);
  if (error.stack) {
    logger.error(error.stack);
  }
  process.exit(1);
});
