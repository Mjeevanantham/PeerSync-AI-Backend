import { Controller, Get, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards';
import { CurrentUser } from './decorators';
import { AuthenticatedUser } from '../common/types';

/**
 * Auth Controller
 * 
 * REST endpoints for token operations.
 * dev-token endpoint is for testing only.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Get public key for external verification
   */
  @Get('public-key')
  getPublicKey(): { publicKey: string } {
    return { publicKey: this.authService.getPublicKey() };
  }

  /**
   * Verify token and return user info
   */
  @Get('verify')
  @UseGuards(JwtAuthGuard)
  verifyToken(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  /**
   * Generate development token (TESTING ONLY)
   */
  @Post('dev-token')
  @HttpCode(HttpStatus.OK)
  generateDevToken(
    @Body() body: { userId: string; email: string; displayName: string },
  ): { token: string; expiresIn: string } {
    const user: AuthenticatedUser = {
      userId: body.userId,
      email: body.email,
      displayName: body.displayName,
      roles: ['developer'],
    };

    return {
      token: this.authService.generateToken(user),
      expiresIn: '1h',
    };
  }
}
