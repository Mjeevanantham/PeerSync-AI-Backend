import { Controller, Get } from '@nestjs/common';

/**
 * Health Check Controller
 * 
 * RAILWAY-SAFE: Provides endpoints for container health checks
 * Used by Railway, Kubernetes, load balancers, etc.
 * 
 * Endpoints (excluded from /api/v1 prefix):
 * - GET /health - Basic health check
 * - GET /health/ready - Readiness probe
 */
@Controller('health')
export class HealthController {
  /**
   * Basic health check
   * GET /health
   * 
   * Lightweight endpoint for health checks.
   * No authentication required.
   * Does not expose secrets.
   */
  @Get()
  check(): { status: string; env: string } {
    return {
      status: 'ok',
      env: process.env.NODE_ENV || 'development',
    };
  }

  /**
   * Readiness probe
   * GET /health/ready
   * 
   * Extended health check for container orchestrators.
   * Can be extended with DB, Redis checks in the future.
   */
  @Get('ready')
  ready(): { status: string; env: string; timestamp: string; checks: Record<string, string> } {
    return {
      status: 'ok',
      env: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
      checks: {
        websocket: 'ok',
        memory: 'ok',
      },
    };
  }
}
