/**
 * Peer-related type definitions
 */

/**
 * Supported IDE types
 */
export enum IdeType {
  VSCODE = 'vscode',
  CURSOR = 'cursor',
  JETBRAINS = 'jetbrains',
  VIM = 'vim',
  NEOVIM = 'neovim',
  EMACS = 'emacs',
  SUBLIME = 'sublime',
  OTHER = 'other',
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAN MODE ADDITION – SAFE EXTENSION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Connection mode indicating network proximity
 * - LAN: Peers on same network (same public IP hash)
 * - REMOTE: Peers on different networks
 */
export enum ConnectionMode {
  LAN = 'LAN',
  REMOTE = 'REMOTE',
}

/**
 * Network context for LAN detection
 * Stores hashed IP for privacy - raw IPs are NEVER exposed
 */
export interface NetworkContext {
  /** SHA-256 hash of client's public IP (never store raw IP) */
  publicIpHash: string;
  /** Detected connection mode relative to other peers */
  connectionMode: ConnectionMode;
}

// ═══════════════════════════════════════════════════════════════════════════════
// END LAN MODE ADDITION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Peer roles within a collaboration
 */
export enum PeerRole {
  HOST = 'host',
  GUEST = 'guest',
  OBSERVER = 'observer',
}

/**
 * Peer connection status
 */
export enum PeerStatus {
  ONLINE = 'online',
  AWAY = 'away',
  BUSY = 'busy',
  OFFLINE = 'offline',
}

/**
 * Registered peer in the registry
 */
export interface RegisteredPeer {
  userId: string;
  socketId: string;
  displayName: string;
  ide: IdeType;
  role: PeerRole;
  status: PeerStatus;
  sessionIds: string[];
  connectedAt: Date;
  lastActivityAt: Date;
  metadata?: PeerMetadata;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LAN MODE ADDITION – SAFE EXTENSION
  // ═══════════════════════════════════════════════════════════════════════════
  /** Network context for LAN detection (optional for backward compatibility) */
  networkContext?: NetworkContext;
  /** Invite-code network ID; peers discover only within same network */
  networkId?: string | null;
  // ═══════════════════════════════════════════════════════════════════════════
}

/**
 * Optional peer metadata
 */
export interface PeerMetadata {
  ideVersion?: string;
  extensionVersion?: string;
  os?: string;
  timezone?: string;
}

/**
 * Peer registration payload
 */
export interface PeerRegistrationPayload {
  displayName: string;
  ide?: IdeType;
  role?: PeerRole;
  metadata?: PeerMetadata;
}

/**
 * Peer lookup result
 */
export interface PeerLookupResult {
  found: boolean;
  peer?: RegisteredPeer;
}
