/**
 * ID generation utilities
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `msg_${uuidv4()}`;
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return `ses_${uuidv4()}`;
}

/**
 * Generate a unique socket ID
 */
export function generateSocketId(): string {
  return `sock_${uuidv4()}`;
}

/**
 * Generate a unique correlation ID for request tracking
 */
export function generateCorrelationId(): string {
  return `cor_${uuidv4()}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAN MODE ADDITION – SAFE EXTENSION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hash an IP address for privacy-safe comparison
 * Uses SHA-256 with a salt to prevent rainbow table attacks
 * 
 * SECURITY: Raw IPs are NEVER stored or exposed
 * Only hashed values are used for LAN detection
 * 
 * @param ip - The IP address to hash
 * @returns SHA-256 hash of the IP
 */
export function hashIpAddress(ip: string): string {
  // Use a consistent salt for same-network comparison
  const salt = 'peersync-lan-detection-v1';
  return createHash('sha256')
    .update(`${salt}:${ip}`)
    .digest('hex');
}

/**
 * Extract client IP from request
 * Handles proxied connections (X-Forwarded-For) and direct connections
 * 
 * @param remoteAddress - Direct socket address
 * @param forwardedFor - X-Forwarded-For header value (if present)
 * @returns The best available client IP
 */
export function extractClientIp(
  remoteAddress: string | undefined,
  forwardedFor: string | undefined,
): string {
  // Prefer X-Forwarded-For (first IP in chain is original client)
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0].trim();
    if (firstIp) {
      return normalizeIpAddress(firstIp);
    }
  }
  
  // Fall back to direct connection
  return normalizeIpAddress(remoteAddress || 'unknown');
}

/**
 * Normalize IP address for consistent hashing
 * Handles IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
 */
function normalizeIpAddress(ip: string): string {
  // Convert IPv4-mapped IPv6 to IPv4
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }
  return ip;
}

// ═══════════════════════════════════════════════════════════════════════════════
// END LAN MODE ADDITION
// ═══════════════════════════════════════════════════════════════════════════════
