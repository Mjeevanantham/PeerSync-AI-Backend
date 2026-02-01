import {
  Injectable,
  NestMiddleware,
  Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * HTTP Logger Middleware
 * 
 * Logs all incoming HTTP requests for debugging.
 * Enables tracing of API calls, timing, and auth context.
 */
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HttpMiddleware');

  use(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    const { method, originalUrl, ip } = req;
    
    // Log request start (debug level)
    this.logger.debug(`[REQ] ${method} ${originalUrl} | IP: ${ip || req.socket?.remoteAddress || 'unknown'}`);

    // Log auth header presence (without value - security)
    const authHeader = req.headers.authorization;
    this.logger.debug(`[REQ] Auth header: ${authHeader ? 'Bearer ***' : 'none'}`);

    // Log response on finish
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const { statusCode } = res;
      const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'debug';
      
      this.logger[logLevel](
        `[RES] ${method} ${originalUrl} | ${statusCode} | ${duration}ms`,
      );
    });

    next();
  }
}
