import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';
import * as jwt from 'jsonwebtoken';
import * as jwksClient from 'jwks-rsa';
import { AuthenticatedUser, SupabaseJwtPayload, UserRecord } from '../common/types';

/**
 * Supabase Authentication Service
 * 
 * Handles JWT verification using Supabase JWKS endpoint.
 * Manages user sync with Supabase Postgres.
 * 
 * PRODUCTION-READY:
 * - Verifies tokens against Supabase JWKS
 * - Validates issuer and audience
 * - Supports OAuth (GitHub) and email login
 * - Auto-syncs users to Postgres on first login
 */
@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private supabase: SupabaseClient;
  private jwksClient: jwksClient.JwksClient;
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;
  private readonly supabaseServiceKey: string;
  private readonly jwtIssuer: string;

  constructor(private readonly configService: ConfigService) {
    // ═══════════════════════════════════════════════════════════════════════════════
    // SUPABASE CONFIGURATION
    // ═══════════════════════════════════════════════════════════════════════════════
    this.supabaseUrl = this.configService.get<string>('SUPABASE_URL', '');
    this.supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY', '');
    this.supabaseServiceKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY', '');

    if (!this.supabaseUrl || !this.supabaseAnonKey) {
      throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
    }

    // JWT issuer is the Supabase project URL
    this.jwtIssuer = `${this.supabaseUrl}/auth/v1`;

    // Initialize Supabase client with service role key for admin operations
    this.supabase = createClient(this.supabaseUrl, this.supabaseServiceKey || this.supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Initialize JWKS client for token verification
    // Supabase exposes JWKS at /.well-known/jwks.json
    this.jwksClient = jwksClient({
      jwksUri: `${this.supabaseUrl}/auth/v1/.well-known/jwks.json`,
      cache: true,
      cacheMaxAge: 600000, // 10 minutes
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Supabase service initialized');
    this.logger.log(`  Project URL: ${this.supabaseUrl}`);
    this.logger.log(`  JWT Issuer: ${this.jwtIssuer}`);
    
    // Verify connection
    try {
      const { error } = await this.supabase.from('users').select('count').limit(0);
      if (error && !error.message.includes('does not exist')) {
        this.logger.warn(`Supabase connection test: ${error.message}`);
      } else {
        this.logger.log('Supabase connection verified');
      }
    } catch (err) {
      this.logger.warn('Could not verify Supabase connection at startup');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // JWT VERIFICATION
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Get signing key from JWKS endpoint
   */
  private getSigningKey(header: jwt.JwtHeader): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!header.kid) {
        // Supabase uses HS256 with project JWT secret for some tokens
        // Fall back to symmetric verification
        const jwtSecret = this.configService.get<string>('SUPABASE_JWT_SECRET', '');
        if (jwtSecret) {
          return resolve(jwtSecret);
        }
        return reject(new Error('Token missing kid header and no JWT secret configured'));
      }

      this.jwksClient.getSigningKey(header.kid, (err, key) => {
        if (err) {
          return reject(err);
        }
        const signingKey = key?.getPublicKey();
        if (!signingKey) {
          return reject(new Error('Unable to get signing key'));
        }
        resolve(signingKey);
      });
    });
  }

  /**
   * Verify Supabase JWT token
   * 
   * Validates:
   * - Token signature (via JWKS or JWT secret)
   * - Token expiration
   * - Issuer (must be Supabase project)
   * - Audience (optional, if configured)
   */
  async verifyToken(token: string): Promise<{ valid: boolean; payload?: SupabaseJwtPayload; error?: string }> {
    try {
      // [DEBUG] Token verification
      this.logger.debug(`[AUTH] Verifying token | tokenLength=${token?.length || 0}`);
      
      // Decode header to get algorithm and kid
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded || typeof decoded === 'string') {
        return { valid: false, error: 'Invalid token format' };
      }

      const { header } = decoded;
      
      // Get signing key based on algorithm
      let secretOrKey: string | Buffer;
      
      if (header.alg === 'HS256') {
        // Supabase uses HS256 with project JWT secret
        const jwtSecret = this.configService.get<string>('SUPABASE_JWT_SECRET', '');
        if (!jwtSecret) {
          return { valid: false, error: 'JWT secret not configured for HS256 tokens' };
        }
        secretOrKey = jwtSecret;
      } else {
        // RS256 or other asymmetric algorithms - use JWKS
        try {
          secretOrKey = await this.getSigningKey(header);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          this.logger.warn(`JWKS key retrieval failed: ${msg}`);
          return { valid: false, error: 'Unable to verify token signature' };
        }
      }

      // Verify the token
      const payload = jwt.verify(token, secretOrKey, {
        algorithms: [header.alg as jwt.Algorithm],
        issuer: this.jwtIssuer,
        // Supabase sets audience to 'authenticated' for logged-in users
        audience: 'authenticated',
      }) as SupabaseJwtPayload;

      this.logger.debug(`[AUTH] Token valid | sub=${payload?.sub} | provider=${payload?.app_metadata?.provider}`);
      return { valid: true, payload };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      
      if (msg.includes('expired')) {
        return { valid: false, error: 'ERR_AUTH_EXPIRED' };
      }
      if (msg.includes('audience') || msg.includes('issuer')) {
        return { valid: false, error: 'ERR_AUTH_INVALID' };
      }
      
      this.logger.warn(`Token verification failed: ${msg}`);
      return { valid: false, error: 'ERR_AUTH_INVALID' };
    }
  }

  /**
   * Validate token and return authenticated user
   */
  async validateToken(token: string): Promise<AuthenticatedUser | null> {
    const result = await this.verifyToken(token);
    
    if (!result.valid || !result.payload) {
      return null;
    }

    const payload = result.payload;

    // Normalize provider: github | google | linkedin | email | otp
    const rawProvider = payload.app_metadata?.provider || 'email';
    const provider = this.normalizeProvider(rawProvider);

    return {
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
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // USER SYNC
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Normalize provider from JWT claims (github | google | linkedin | email | otp)
   */
  private normalizeProvider(raw: string): string {
    const p = raw.toLowerCase();
    if (p === 'github' || p === 'google' || p === 'linkedin') return p;
    if (p === 'magiclink' || p === 'phone') return 'otp';
    return 'email';
  }

  /**
   * Sync user to Supabase Postgres on first login
   * On subsequent logins: UPDATE last_login_at
   */
  async syncUser(user: AuthenticatedUser): Promise<UserRecord | null> {
    try {
      this.logger.debug(`[AUTH] Syncing user | userId=${user.userId} | email=${user.email} | provider=${user.provider}`);
      const now = new Date().toISOString();
      const userRecord: Partial<UserRecord> = {
        id: user.userId,
        email: user.email,
        display_name: user.displayName,
        provider: user.provider || 'email',
        avatar_url: user.avatarUrl,
        updated_at: now,
        last_login_at: now,
      };

      // Upsert user record
      const { data, error } = await this.supabase
        .from('users')
        .upsert(userRecord, {
          onConflict: 'id',
          ignoreDuplicates: false,
        })
        .select()
        .single();

      if (error) {
        // Table might not exist yet - that's OK, auth still works
        if (error.message.includes('does not exist')) {
          this.logger.warn(`[AUTH] users table does not exist - run migration: npm run db:migrate:remote | userId=${user.userId}`);
          return null;
        }
        this.logger.error(`User sync failed: ${error.message}`);
        return null;
      }

      this.logger.debug(`[AUTH] User synced | userId=${user.userId}`);
      return data as UserRecord;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`User sync error: ${msg}`);
      return null;
    }
  }

  /**
   * Get user record from Postgres
   */
  async getUser(userId: string): Promise<UserRecord | null> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        return null;
      }

      return data as UserRecord;
    } catch {
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SUPABASE CLIENT ACCESS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Get Supabase client for direct database access
   */
  getClient(): SupabaseClient {
    return this.supabase;
  }

  /**
   * Get user from Supabase Auth by token
   * 
   * Alternative verification method using Supabase's built-in getUser()
   */
  async getUserFromToken(token: string): Promise<SupabaseUser | null> {
    try {
      const { data, error } = await this.supabase.auth.getUser(token);
      
      if (error || !data.user) {
        return null;
      }
      
      return data.user;
    } catch {
      return null;
    }
  }
}
