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
 * Backend validates tokens but does NOT issue them for production.
 * Token generation is for development only.
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
      this.logger.log('RSA keys loaded successfully');
    } catch (error) {
      this.logger.error('Failed to load RSA keys. Run "npm run generate:keys"');
      throw error;
    }
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
   * Get public key
   */
  getPublicKey(): string {
    return this.publicKey;
  }
}
