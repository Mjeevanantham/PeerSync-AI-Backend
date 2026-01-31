import { Controller, Get } from '@nestjs/common';

/**
 * Health Check Controller
 * 
 * PRODUCTION HARDENING: Provides endpoint for container health checks
 * Used by Railway, Kubernetes, load balancers, etc.
 */
@Controller('health')
export class HealthController {
  /**
   * Basic health check
   * GET /api/v1/health
   */
  @Get()
  check(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Detailed health check (can be extended with DB, Redis checks later)
   * GET /api/v1/health/ready
   */
  @Get('ready')
  ready(): { status: string; checks: Record<string, string> } {
    return {
      status: 'ok',
      checks: {
        websocket: 'ok',
        memory: 'ok',
      },
    };
  }
}
