import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as fs from 'fs';
import * as path from 'path';
import { JwtPayload, AuthenticatedUser, TokenValidationResult } from '../common/types';
import { ErrorCodes, ErrorMessages } from '../common/constants';

/**
 * Authentication Service
 * 
 * Handles JWT token validation using RS256.
 * 
 * PRODUCTION: Supports two modes for RSA keys:
 * 1. Environment variables (JWT_PUBLIC_KEY, JWT_PRIVATE_KEY) - for Railway/cloud
 * 2. File paths (JWT_PUBLIC_KEY_PATH, JWT_PRIVATE_KEY_PATH) - for local dev
 * 
 * Environment variables take precedence over file paths.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly publicKey: string;
  private readonly privateKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    // ═══════════════════════════════════════════════════════════════════════════════
    // PRODUCTION HARDENING: Support keys from environment variables
    // Railway and similar platforms don't support filesystem key storage
    // ═══════════════════════════════════════════════════════════════════════════════
    
    // Try environment variables first (production mode)
    const envPublicKey = this.configService.get<string>('JWT_PUBLIC_KEY');
    const envPrivateKey = this.configService.get<string>('JWT_PRIVATE_KEY');

    if (envPublicKey && envPrivateKey) {
      // Use keys from environment variables
      // Keys may be base64 encoded or have escaped newlines
      this.publicKey = this.parseKey(envPublicKey);
      this.privateKey = this.parseKey(envPrivateKey);
      this.logger.log('RSA keys loaded from environment variables');
    } else {
      // Fall back to file paths (development mode)
      const publicKeyPath = this.configService.get<string>(
        'JWT_PUBLIC_KEY_PATH',
        './keys/public.pem',
      );
      const privateKeyPath = this.configService.get<string>(
        'JWT_PRIVATE_KEY_PATH',
        './keys/private.pem',
      );

      try {
        this.publicKey = fs.readFileSync(
          path.resolve(process.cwd(), publicKeyPath),
          'utf8',
        );
        this.privateKey = fs.readFileSync(
          path.resolve(process.cwd(), privateKeyPath),
          'utf8',
        );
        this.logger.log('RSA keys loaded from files');
      } catch (error) {
        this.logger.error('Failed to load RSA keys.');
        this.logger.error('For local dev: Run "npm run generate:keys"');
        this.logger.error('For production: Set JWT_PUBLIC_KEY and JWT_PRIVATE_KEY env vars');
        throw error;
      }
    }
    // ═══════════════════════════════════════════════════════════════════════════════
  }

  /**
   * Parse key from environment variable
   * Handles base64 encoding and escaped newlines
   */
  private parseKey(key: string): string {
    // If key looks like base64 (no PEM headers), decode it
    if (!key.includes('-----BEGIN')) {
      try {
        return Buffer.from(key, 'base64').toString('utf8');
      } catch {
        // Not base64, try other methods
      }
    }
    
    // Handle escaped newlines (common in env vars)
    return key.replace(/\\n/g, '\n');
  }

  /**
   * Validate JWT token and extract user
   */
  async validateToken(token: string): Promise<TokenValidationResult> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        publicKey: this.publicKey,
        algorithms: ['RS256'],
        issuer: this.configService.get<string>('JWT_ISSUER', 'peersync-dev-connect'),
        audience: this.configService.get<string>('JWT_AUDIENCE', 'peersync-clients'),
      });

      const user: AuthenticatedUser = {
        userId: payload.sub,
        email: payload.email,
        displayName: payload.name,
        roles: payload.roles || [],
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
   */
  async validateWsToken(token: string): Promise<AuthenticatedUser> {
    if (!token) {
      throw new UnauthorizedException(ErrorMessages[ErrorCodes.AUTH_TOKEN_MISSING]);
    }

    const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;
    const result = await this.validateToken(cleanToken);

    if (!result.valid || !result.user) {
      throw new UnauthorizedException(
        result.error || ErrorMessages[ErrorCodes.AUTH_TOKEN_INVALID]
      );
    }

    return result.user;
  }

  /**
   * Generate token (development only)
   * 
   * WARNING: In production, tokens should be issued by a dedicated auth service
   */
  generateToken(user: AuthenticatedUser): string {
    const payload: Partial<JwtPayload> = {
      sub: user.userId,
      email: user.email,
      name: user.displayName,
      roles: user.roles,
    };

    return this.jwtService.sign(payload, {
      privateKey: this.privateKey,
      algorithm: 'RS256',
      expiresIn: this.configService.get<string>('JWT_EXPIRATION', '1h'),
      issuer: this.configService.get<string>('JWT_ISSUER', 'peersync-dev-connect'),
      audience: this.configService.get<string>('JWT_AUDIENCE', 'peersync-clients'),
    });
  }

  /**
   * Get public key (for verification by clients)
   */
  getPublicKey(): string {
    return this.publicKey;
  }
}
