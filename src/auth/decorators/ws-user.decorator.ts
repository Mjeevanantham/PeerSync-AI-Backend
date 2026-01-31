import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types';

/**
 * Decorator to extract the current authenticated user from WebSocket context
 * 
 * Usage:
 * @SubscribeMessage('message')
 * handleMessage(@WsUser() user: AuthenticatedUser) {
 *   return user;
 * }
 */
export const WsUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext): AuthenticatedUser | unknown => {
    const client = ctx.switchToWs().getClient();
    const user = client.user as AuthenticatedUser;

    if (data) {
      return user?.[data];
    }

    return user;
  },
);
