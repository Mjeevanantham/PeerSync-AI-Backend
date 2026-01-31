import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ErrorCodes, ErrorMessages } from '../../common/constants';

/**
 * JWT Authentication Guard for HTTP requests
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest<TUser>(err: Error | null, user: TUser | false): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException(ErrorMessages[ErrorCodes.AUTH_TOKEN_INVALID]);
    }
    return user;
  }
}
