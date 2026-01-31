/**
 * Authentication-related type definitions
 */

/**
 * JWT payload structure for RS256 tokens
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
 * Authenticated user context attached to socket
 */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  displayName: string;
  roles: string[];
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  valid: boolean;
  user?: AuthenticatedUser;
  error?: string;
}
