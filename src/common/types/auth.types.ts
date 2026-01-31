/**
 * Authentication-related type definitions
 */

/**
 * JWT payload structure for RS256 tokens (legacy - kept for compatibility)
 */
export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti?: string;
  roles?: string[];
}

/**
 * Supabase JWT payload structure
 * 
 * This is the structure of JWTs issued by Supabase Auth.
 * Supports OAuth (GitHub, Google, etc.) and email/password login.
 */
export interface SupabaseJwtPayload {
  /** User ID (UUID) */
  sub: string;
  /** Audience - typically 'authenticated' */
  aud: string;
  /** Issuer - Supabase project URL + /auth/v1 */
  iss: string;
  /** Issued at timestamp */
  iat: number;
  /** Expiration timestamp */
  exp: number;
  /** User's email address */
  email?: string;
  /** Phone number (if phone auth) */
  phone?: string;
  /** User role - 'authenticated', 'anon', 'service_role' */
  role?: string;
  /** App metadata (provider info, etc.) */
  app_metadata?: {
    provider?: string;
    providers?: string[];
    [key: string]: unknown;
  };
  /** User metadata (profile info from OAuth) */
  user_metadata?: {
    full_name?: string;
    name?: string;
    avatar_url?: string;
    email?: string;
    email_verified?: boolean;
    preferred_username?: string;
    user_name?: string;
    [key: string]: unknown;
  };
  /** Session ID */
  session_id?: string;
  /** Authentication level */
  aal?: string;
  /** Multi-factor authentication */
  amr?: Array<{ method: string; timestamp: number }>;
}

/**
 * Authenticated user context attached to socket
 */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  displayName: string;
  roles: string[];
  /** Auth provider (github, google, email, etc.) */
  provider?: string;
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  valid: boolean;
  user?: AuthenticatedUser;
  error?: string;
}

/**
 * User record in Supabase Postgres (public.users table)
 */
export interface UserRecord {
  id: string;
  email: string;
  display_name: string;
  provider: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}
