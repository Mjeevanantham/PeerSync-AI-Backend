import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { ErrorCodes, ErrorMessages } from '../../common/constants';

/**
 * Guard that validates Supabase JWT using the same AuthService as WebSocket.
 * Use this for REST endpoints so token verification is identical to WS AUTH.
 */
@Injectable()
export class SupabaseJwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseJwtAuthGuard.name);

  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader ?? undefined;

    if (!token) {
      this.logger.debug('[HTTP] No Bearer token in Authorization header');
      throw new UnauthorizedException(ErrorMessages[ErrorCodes.AUTH_TOKEN_MISSING]);
    }

    const result = await this.authService.validateToken(token);
    if (!result.valid || !result.user) {
      this.logger.debug(`[HTTP] Token invalid: ${result.error ?? 'unknown'}`);
      throw new UnauthorizedException(result.error ?? ErrorMessages[ErrorCodes.AUTH_TOKEN_INVALID]);
    }

    (request as Request & { user: typeof result.user }).user = result.user;
    return true;
  }
}
