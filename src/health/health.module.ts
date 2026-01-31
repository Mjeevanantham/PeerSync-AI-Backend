import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * Health Check Module
 * 
 * PRODUCTION HARDENING: Provides health endpoints for monitoring
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
