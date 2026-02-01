import { Injectable, Logger, UnauthorizedException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedUser, TokenValidationResult } from '../common/types';
import { ErrorCodes, ErrorMessages } from '../common/constants';
import { SupabaseService } from './supabase.service';

/**
 * Authentication Service
 * 
 * Handles JWT token validation using Supabase Auth.
 * 
 * SUPABASE INTEGRATION:
 * - Verifies tokens using Supabase JWKS or JWT secret
 * - Validates issuer (Supabase project URL)
 * - Validates audience ('authenticated')
 * - Supports OAuth (GitHub, Google) and email login
 * - Auto-syncs users to Postgres on first login
 * 
 * NO CUSTOM RSA KEYS REQUIRED - uses Supabase's built-in auth
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseService: SupabaseService,
  ) {}

  /**
   * Validate configuration on module initialization
   */
  onModuleInit(): void {
    this.logger.log('Auth service initialized with Supabase');
  }

  /**
   * Validate JWT token and extract user
   * 
   * Uses Supabase's JWKS endpoint for token verification.
   */
  async validateToken(token: string): Promise<TokenValidationResult> {
    try {
      const result = await this.supabaseService.verifyToken(token);

      if (!result.valid || !result.payload) {
        // Map Supabase errors to our error codes
        if (result.error === 'ERR_AUTH_EXPIRED') {
          return { valid: false, error: ErrorMessages[ErrorCodes.AUTH_TOKEN_EXPIRED] };
        }
        return { valid: false, error: ErrorMessages[ErrorCodes.AUTH_TOKEN_INVALID] };
      }

      const payload = result.payload;
      const rawProvider = payload.app_metadata?.provider || 'email';
      const provider = ['github', 'google', 'linkedin'].includes(rawProvider)
        ? rawProvider
        : ['magiclink', 'phone'].includes(rawProvider)
          ? 'otp'
          : 'email';

      const user: AuthenticatedUser = {
        userId: payload.sub,
        email: payload.email || '',
        displayName: payload.user_metadata?.full_name ||
                     payload.user_metadata?.name ||
                     payload.email?.split('@')[0] ||
                     'User',
        roles: payload.role ? [payload.role] : [],
        provider,
        avatarUrl: (payload.user_metadata?.avatar_url ?? payload.user_metadata?.picture) as string | undefined,
      };

      return { valid: true, user };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Token validation failed: ${msg}`);

      if (msg.includes('expired')) {
        return { valid: false, error: ErrorMessages[ErrorCodes.AUTH_TOKEN_EXPIRED] };
      }
      return { valid: false, error: ErrorMessages[ErrorCodes.AUTH_TOKEN_INVALID] };
    }
  }

  /**
   * Validate WebSocket token
   * 
   * Expects token in format: "Bearer <supabase_access_token>" or just the token
   */
  async validateWsToken(token: string): Promise<AuthenticatedUser> {
    if (!token) {
      throw new UnauthorizedException(ErrorMessages[ErrorCodes.AUTH_TOKEN_MISSING]);
    }

    // Handle "Bearer " prefix
    const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;
    const result = await this.validateToken(cleanToken);

    if (!result.valid || !result.user) {
      // Throw with specific error code for better client handling
      const errorMessage = result.error || ErrorMessages[ErrorCodes.AUTH_TOKEN_INVALID];
      
      // Map to WebSocket-friendly error codes
      if (errorMessage.includes('expired')) {
        throw new UnauthorizedException('ERR_AUTH_EXPIRED');
      }
      throw new UnauthorizedException('ERR_AUTH_INVALID');
    }

    // Sync user to database on successful auth
    // This is fire-and-forget - don't block auth on DB sync
    this.syncUserAsync(result.user);

    return result.user;
  }

  /**
   * Sync user to database asynchronously
   * 
   * Non-blocking - auth succeeds even if sync fails
   */
  private async syncUserAsync(user: AuthenticatedUser): Promise<void> {
    try {
      await this.supabaseService.syncUser(user);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`User sync failed (non-blocking): ${msg}`);
    }
  }

  /**
   * Get authenticated user from Supabase by token
   * 
   * Alternative method that calls Supabase Auth API directly.
   * Useful for double-checking token validity.
   */
  async getUserFromSupabase(token: string): Promise<AuthenticatedUser | null> {
    const supabaseUser = await this.supabaseService.getUserFromToken(token);
    
    if (!supabaseUser) {
      return null;
    }

    return {
      userId: supabaseUser.id,
      email: supabaseUser.email || '',
      displayName: supabaseUser.user_metadata?.full_name || 
                   supabaseUser.user_metadata?.name || 
                   supabaseUser.email?.split('@')[0] || 
                   'User',
      roles: supabaseUser.role ? [supabaseUser.role] : [],
      provider: supabaseUser.app_metadata?.provider || 'email',
    };
  }
}
