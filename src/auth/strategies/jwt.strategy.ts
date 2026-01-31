import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as fs from 'fs';
import * as path from 'path';
import { JwtPayload, AuthenticatedUser } from '../../common/types';
import { ErrorCodes, ErrorMessages } from '../../common/constants';

/**
 * JWT Strategy for Passport (HTTP requests)
 * 
 * RAILWAY-SAFE: Supports keys from environment variables OR file paths
 * Priority: JWT_PUBLIC_KEY env var > JWT_PUBLIC_KEY_PATH file
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private static readonly logger = new Logger('JwtStrategy');

  constructor(configService: ConfigService) {
    // ═══════════════════════════════════════════════════════════════════════════════
    // RAILWAY-SAFE: Load public key from env var OR file path
    // ═══════════════════════════════════════════════════════════════════════════════
    const publicKey = JwtStrategy.loadPublicKey(configService);

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: publicKey,
      algorithms: ['RS256'],
      issuer: configService.get<string>('JWT_ISSUER', 'peersync-dev-connect'),
      audience: configService.get<string>('JWT_AUDIENCE', 'peersync-clients'),
    });
  }

  /**
   * Load public key from environment variable or file path
   * 
   * PRIORITY:
   * 1. JWT_PUBLIC_KEY (env var) - for Railway/production
   * 2. JWT_PUBLIC_KEY_PATH (file path) - for local dev
   */
  private static loadPublicKey(configService: ConfigService): string {
    // Try environment variable first (Railway/production)
    const envPublicKey = process.env.JWT_PUBLIC_KEY;

    if (envPublicKey) {
      JwtStrategy.logger.log('Loading JWT public key from environment variable');
      // Handle escaped newlines (\\n → \n)
      const parsedKey = envPublicKey.replace(/\\n/g, '\n');
      
      // Validate PEM format
      if (!parsedKey.includes('-----BEGIN PUBLIC KEY-----')) {
        throw new Error('JWT_PUBLIC_KEY is not a valid PEM public key');
      }
      
      return parsedKey;
    }

    // Fall back to file path (local development)
    const publicKeyPath = configService.get<string>(
      'JWT_PUBLIC_KEY_PATH',
      './keys/public.pem',
    );

    JwtStrategy.logger.log(`Loading JWT public key from file: ${publicKeyPath}`);

    try {
      const resolvedPath = path.resolve(process.cwd(), publicKeyPath);
      
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Public key file not found: ${resolvedPath}`);
      }
      
      return fs.readFileSync(resolvedPath, 'utf8');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      JwtStrategy.logger.error('═══════════════════════════════════════════════════════════════');
      JwtStrategy.logger.error('FATAL: Failed to load JWT public key');
      JwtStrategy.logger.error('═══════════════════════════════════════════════════════════════');
      JwtStrategy.logger.error(`Error: ${errorMsg}`);
      JwtStrategy.logger.error('');
      JwtStrategy.logger.error('SOLUTION (choose one):');
      JwtStrategy.logger.error('');
      JwtStrategy.logger.error('Option A - Local Development:');
      JwtStrategy.logger.error('  Run: npm run generate:keys');
      JwtStrategy.logger.error('');
      JwtStrategy.logger.error('Option B - Production (Railway):');
      JwtStrategy.logger.error('  Set environment variable:');
      JwtStrategy.logger.error('    JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\\n...\\n-----END PUBLIC KEY-----');
      JwtStrategy.logger.error('═══════════════════════════════════════════════════════════════');
      throw error;
    }
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException(ErrorMessages[ErrorCodes.AUTH_TOKEN_INVALID]);
    }

    return {
      userId: payload.sub,
      email: payload.email,
      displayName: payload.name,
      roles: payload.roles || [],
    };
  }
}
