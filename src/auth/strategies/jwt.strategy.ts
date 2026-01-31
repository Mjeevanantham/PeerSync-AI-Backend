import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as jwksRsa from 'jwks-rsa';
import { SupabaseJwtPayload, AuthenticatedUser } from '../../common/types';
import { ErrorCodes, ErrorMessages } from '../../common/constants';

/**
 * JWT Strategy for Passport (HTTP requests)
 * 
 * SUPABASE INTEGRATION:
 * - Verifies tokens using Supabase JWT secret (HS256)
 * - Validates issuer (Supabase project URL)
 * - Validates audience ('authenticated')
 * - Supports OAuth (GitHub, Google) and email login
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private static readonly logger = new Logger('JwtStrategy');

  constructor(configService: ConfigService) {
    // ═══════════════════════════════════════════════════════════════════════════════
    // SUPABASE JWT CONFIGURATION
    // ═══════════════════════════════════════════════════════════════════════════════
    const supabaseUrl = configService.get<string>('SUPABASE_URL', '');
    const jwtSecret = configService.get<string>('SUPABASE_JWT_SECRET', '');

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL is required for JWT strategy');
    }

    if (!jwtSecret) {
      throw new Error('SUPABASE_JWT_SECRET is required for JWT strategy');
    }

    JwtStrategy.logger.log('Initializing JWT strategy with Supabase');
    JwtStrategy.logger.log(`  Issuer: ${supabaseUrl}/auth/v1`);

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Supabase uses HS256 with project JWT secret
      secretOrKey: jwtSecret,
      algorithms: ['HS256'],
      issuer: `${supabaseUrl}/auth/v1`,
      audience: 'authenticated',
    });
  }

  /**
   * Validate JWT payload and return authenticated user
   * 
   * Called after token signature is verified.
   */
  async validate(payload: SupabaseJwtPayload): Promise<AuthenticatedUser> {
    // Ensure we have required claims
    if (!payload.sub) {
      JwtStrategy.logger.warn('Token missing sub claim');
      throw new UnauthorizedException(ErrorMessages[ErrorCodes.AUTH_TOKEN_INVALID]);
    }

    // Extract user info from Supabase JWT
    return {
      userId: payload.sub,
      email: payload.email || '',
      displayName: payload.user_metadata?.full_name || 
                   payload.user_metadata?.name || 
                   payload.user_metadata?.preferred_username ||
                   payload.email?.split('@')[0] || 
                   'User',
      roles: payload.role ? [payload.role] : [],
      provider: payload.app_metadata?.provider || 'email',
    };
  }
}
