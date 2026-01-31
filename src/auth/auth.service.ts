import { Injectable, Logger, UnauthorizedException, OnModuleInit } from '@nestjs/common';
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
 * RAILWAY-SAFE: Supports two modes for RSA keys:
 * 1. Environment variables (JWT_PUBLIC_KEY, JWT_PRIVATE_KEY) - for Railway/cloud
 * 2. File paths (JWT_PUBLIC_KEY_PATH, JWT_PRIVATE_KEY_PATH) - for local dev
 * 
 * Priority: Environment variables > File paths
 * FAIL FAST: Throws at startup if no keys are available
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private readonly publicKey: string;
  private readonly privateKey: string;
  private readonly jwtIssuer: string;
  private readonly jwtAudience: string;
  private readonly jwtExpiration: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    // ═══════════════════════════════════════════════════════════════════════════════
    // RAILWAY-SAFE: Load JWT configuration with validation
    // ═══════════════════════════════════════════════════════════════════════════════
    
    // Load and validate JWT config
    this.jwtIssuer = this.configService.get<string>('JWT_ISSUER', 'peersync-dev-connect');
    this.jwtAudience = this.configService.get<string>('JWT_AUDIENCE', 'peersync-clients');
    this.jwtExpiration = this.configService.get<string>('JWT_EXPIRATION', '1h');

    // Load RSA keys (env vars take priority over file paths)
    const { publicKey, privateKey } = this.loadRsaKeys();
    this.publicKey = publicKey;
    this.privateKey = privateKey;
    // ═══════════════════════════════════════════════════════════════════════════════
  }

  /**
   * Validate configuration on module initialization
   */
  onModuleInit(): void {
    this.validateConfiguration();
  }

  /**
   * Load RSA keys from environment variables or file paths
   * 
   * PRIORITY ORDER:
   * 1. JWT_PUBLIC_KEY / JWT_PRIVATE_KEY (env vars) - for Railway/production
   * 2. JWT_PUBLIC_KEY_PATH / JWT_PRIVATE_KEY_PATH (file paths) - for local dev
   * 
   * FAIL FAST: Throws if neither source is available
   */
  private loadRsaKeys(): { publicKey: string; privateKey: string } {
    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 1: Try environment variables first (Railway/production)
    // ═══════════════════════════════════════════════════════════════════════════════
    const envPublicKey = process.env.JWT_PUBLIC_KEY;
    const envPrivateKey = process.env.JWT_PRIVATE_KEY;

    if (envPublicKey && envPrivateKey) {
      this.logger.log('Loading RSA keys from environment variables');
      
      const publicKey = this.parseKeyFromEnv(envPublicKey);
      const privateKey = this.parseKeyFromEnv(envPrivateKey);
      
      // Validate key format
      if (!this.isValidPemKey(publicKey, 'PUBLIC')) {
        throw new Error('JWT_PUBLIC_KEY is not a valid PEM public key');
      }
      if (!this.isValidPemKey(privateKey, 'PRIVATE') && !this.isValidPemKey(privateKey, 'RSA PRIVATE')) {
        throw new Error('JWT_PRIVATE_KEY is not a valid PEM private key');
      }
      
      this.logger.log('RSA keys loaded from environment variables');
      return { publicKey, privateKey };
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 2: Fall back to file paths (local development)
    // ═══════════════════════════════════════════════════════════════════════════════
    const publicKeyPath = this.configService.get<string>('JWT_PUBLIC_KEY_PATH', './keys/public.pem');
    const privateKeyPath = this.configService.get<string>('JWT_PRIVATE_KEY_PATH', './keys/private.pem');

    this.logger.log('Loading RSA keys from file paths');

    try {
      const resolvedPublicPath = path.resolve(process.cwd(), publicKeyPath);
      const resolvedPrivatePath = path.resolve(process.cwd(), privateKeyPath);

      // Check if files exist before reading
      if (!fs.existsSync(resolvedPublicPath)) {
        throw new Error(`Public key file not found: ${resolvedPublicPath}`);
      }
      if (!fs.existsSync(resolvedPrivatePath)) {
        throw new Error(`Private key file not found: ${resolvedPrivatePath}`);
      }

      const publicKey = fs.readFileSync(resolvedPublicPath, 'utf8');
      const privateKey = fs.readFileSync(resolvedPrivatePath, 'utf8');

      this.logger.log('RSA keys loaded from files');
      return { publicKey, privateKey };
    } catch (error) {
      // ═══════════════════════════════════════════════════════════════════════════════
      // FAIL FAST: No keys available from any source
      // ═══════════════════════════════════════════════════════════════════════════════
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('═══════════════════════════════════════════════════════════════');
      this.logger.error('FATAL: Failed to load RSA keys');
      this.logger.error('═══════════════════════════════════════════════════════════════');
      this.logger.error(`Error: ${errorMsg}`);
      this.logger.error('');
      this.logger.error('SOLUTION (choose one):');
      this.logger.error('');
      this.logger.error('Option A - Local Development:');
      this.logger.error('  Run: npm run generate:keys');
      this.logger.error('  This creates ./keys/public.pem and ./keys/private.pem');
      this.logger.error('');
      this.logger.error('Option B - Production (Railway):');
      this.logger.error('  Set environment variables:');
      this.logger.error('    JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\\n...\\n-----END PUBLIC KEY-----');
      this.logger.error('    JWT_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\\n...\\n-----END RSA PRIVATE KEY-----');
      this.logger.error('═══════════════════════════════════════════════════════════════');
      throw new Error('RSA keys not available. See logs for configuration options.');
    }
  }

  /**
   * Parse key from environment variable
   * Handles escaped newlines (\n) commonly used in env vars
   */
  private parseKeyFromEnv(key: string): string {
    // Handle escaped newlines (\\n → \n)
    // This is the most common format for PEM keys in environment variables
    return key.replace(/\\n/g, '\n');
  }

  /**
   * Validate that a key is in PEM format
   */
  private isValidPemKey(key: string, type: 'PUBLIC' | 'PRIVATE' | 'RSA PRIVATE'): boolean {
    const header = `-----BEGIN ${type} KEY-----`;
    const footer = `-----END ${type} KEY-----`;
    return key.includes(header) && key.includes(footer);
  }

  /**
   * Validate JWT configuration at startup
   */
  private validateConfiguration(): void {
    this.logger.log('Validating JWT configuration...');

    // Validate issuer
    if (!this.jwtIssuer || this.jwtIssuer.trim() === '') {
      this.logger.warn('JWT_ISSUER is empty, using default: peersync-dev-connect');
    }

    // Validate audience
    if (!this.jwtAudience || this.jwtAudience.trim() === '') {
      this.logger.warn('JWT_AUDIENCE is empty, using default: peersync-clients');
    }

    // Validate expiration format
    const validExpirationPattern = /^(\d+[smhd]|\d+)$/;
    if (!validExpirationPattern.test(this.jwtExpiration)) {
      this.logger.warn(`JWT_EXPIRATION "${this.jwtExpiration}" may be invalid. Expected format: 1h, 30m, 7d, etc.`);
    }

    this.logger.log('JWT configuration validated');
    this.logger.log(`  Issuer: ${this.jwtIssuer}`);
    this.logger.log(`  Audience: ${this.jwtAudience}`);
    this.logger.log(`  Expiration: ${this.jwtExpiration}`);
  }

  /**
   * Validate JWT token and extract user
   */
  async validateToken(token: string): Promise<TokenValidationResult> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        publicKey: this.publicKey,
        algorithms: ['RS256'],
        issuer: this.jwtIssuer,
        audience: this.jwtAudience,
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
      expiresIn: this.jwtExpiration,
      issuer: this.jwtIssuer,
      audience: this.jwtAudience,
    });
  }

  /**
   * Get public key (for verification by clients)
   */
  getPublicKey(): string {
    return this.publicKey;
  }
}
