import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards';
import { CurrentUser } from './decorators';
import { AuthenticatedUser } from '../common/types';

/**
 * Auth Controller
 * 
 * REST endpoints for token verification.
 * 
 * SUPABASE INTEGRATION:
 * - Tokens are issued by Supabase Auth (client-side)
 * - Backend only verifies tokens, does not issue them
 * - Use Supabase client libraries for login/signup
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Verify token and return user info
   * 
   * Use this endpoint to:
   * - Validate that a Supabase token is valid
   * - Get the authenticated user's information
   * - Test authentication before connecting WebSocket
   */
  @Get('verify')
  @UseGuards(JwtAuthGuard)
  verifyToken(@CurrentUser() user: AuthenticatedUser): {
    userId: string;
    email: string;
    displayName: string;
    provider?: string;
    roles: string[];
  } {
    return {
      userId: user.userId,
      email: user.email,
      displayName: user.displayName,
      provider: user.provider,
      roles: user.roles,
    };
  }

  /**
   * Health check for auth service
   */
  @Get('health')
  health(): { status: string; provider: string } {
    return {
      status: 'ok',
      provider: 'supabase',
    };
  }
}
