import { Injectable, Logger } from '@nestjs/common';
import {
  RegisteredPeer,
  PeerRegistrationPayload,
  PeerLookupResult,
  PeerStatus,
  PeerRole,
  IdeType,
  // LAN MODE ADDITION
  NetworkContext,
  ConnectionMode,
} from '../common/types';

/**
 * In-memory Peer Registry Service
 * 
 * Backend is the SINGLE source of truth for peer state.
 * - Tracks userId, socketId, role, ide, status
 * - Prevents duplicate user connections
 * - Cleanup on disconnect
 */
@Injectable()
export class PeerRegistryService {
  private readonly logger = new Logger(PeerRegistryService.name);

  /** Primary registry: userId -> RegisteredPeer */
  private readonly peersByUserId: Map<string, RegisteredPeer> = new Map();

  /** Secondary index: socketId -> userId for reverse lookup */
  private readonly socketIdToUserId: Map<string, string> = new Map();

  /**
   * Register a new peer or update existing
   *
   * @param userId - User identifier
   * @param payload - Registration payload
   * @param socketId - Socket identifier
   * @param ipHash - Optional hashed IP for LAN detection
   * @param networkId - Optional invite-code network ID (peer discovery scoped to same network)
   */
  registerPeer(
    userId: string,
    payload: PeerRegistrationPayload,
    socketId: string,
    ipHash?: string,
    networkId?: string,
  ): RegisteredPeer {
    const now = new Date();

    // Check if peer already registered (duplicate connection)
    const existingPeer = this.peersByUserId.get(userId);
    if (existingPeer) {
      // Remove old socket mapping
      this.socketIdToUserId.delete(existingPeer.socketId);
      this.logger.debug(`Replacing existing peer registration: userId=${userId}`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LAN MODE ADDITION – SAFE EXTENSION
    // ═══════════════════════════════════════════════════════════════════════════
    // Determine network context if IP hash is provided
    let networkContext: NetworkContext | undefined;
    if (ipHash) {
      networkContext = {
        publicIpHash: ipHash,
        // Default to REMOTE, will be recalculated in getOnlinePeersWithLanContext
        connectionMode: ConnectionMode.REMOTE,
      };
    }
    // ═══════════════════════════════════════════════════════════════════════════

    const peer: RegisteredPeer = {
      userId,
      socketId,
      displayName: payload.displayName,
      ide: payload.ide || IdeType.OTHER,
      role: payload.role || PeerRole.GUEST,
      status: PeerStatus.ONLINE,
      sessionIds: existingPeer?.sessionIds || [],
      connectedAt: now,
      lastActivityAt: now,
      metadata: payload.metadata,
      networkContext,
      networkId: networkId ?? null,
    };

    this.peersByUserId.set(userId, peer);
    this.socketIdToUserId.set(socketId, userId);

    this.logger.log(`Peer registered: userId=${userId}, socketId=${socketId}, ide=${peer.ide}`);

    return peer;
  }

  /**
   * Unregister peer by userId
   */
  unregisterPeerByUserId(userId: string): boolean {
    const peer = this.peersByUserId.get(userId);
    if (!peer) return false;

    this.socketIdToUserId.delete(peer.socketId);
    this.peersByUserId.delete(userId);

    this.logger.log(`Peer unregistered: userId=${userId}`);
    return true;
  }

  /**
   * Unregister peer by socketId
   */
  unregisterPeerBySocketId(socketId: string): boolean {
    const userId = this.socketIdToUserId.get(socketId);
    if (!userId) return false;
    return this.unregisterPeerByUserId(userId);
  }

  /**
   * Get peer by userId
   */
  getPeerByUserId(userId: string): PeerLookupResult {
    const peer = this.peersByUserId.get(userId);
    return { found: !!peer, peer };
  }

  /**
   * Get peer by socketId
   */
  getPeerBySocketId(socketId: string): PeerLookupResult {
    const userId = this.socketIdToUserId.get(socketId);
    if (!userId) return { found: false };
    return this.getPeerByUserId(userId);
  }

  /**
   * Check if peer is registered
   */
  isPeerRegistered(userId: string): boolean {
    return this.peersByUserId.has(userId);
  }

  /**
   * Update peer status
   */
  updatePeerStatus(userId: string, status: PeerStatus): boolean {
    const peer = this.peersByUserId.get(userId);
    if (!peer) return false;

    peer.status = status;
    peer.lastActivityAt = new Date();
    return true;
  }

  /**
   * Update peer activity timestamp
   */
  updatePeerActivity(userId: string): boolean {
    const peer = this.peersByUserId.get(userId);
    if (!peer) return false;

    peer.lastActivityAt = new Date();
    return true;
  }

  /**
   * Add session to peer
   */
  addSessionToPeer(userId: string, sessionId: string): boolean {
    const peer = this.peersByUserId.get(userId);
    if (!peer) return false;

    if (!peer.sessionIds.includes(sessionId)) {
      peer.sessionIds.push(sessionId);
      peer.lastActivityAt = new Date();
    }
    return true;
  }

  /**
   * Remove session from peer
   */
  removeSessionFromPeer(userId: string, sessionId: string): boolean {
    const peer = this.peersByUserId.get(userId);
    if (!peer) return false;

    const idx = peer.sessionIds.indexOf(sessionId);
    if (idx !== -1) {
      peer.sessionIds.splice(idx, 1);
      peer.lastActivityAt = new Date();
    }
    return true;
  }

  /**
   * Get all online peers
   */
  getOnlinePeers(): RegisteredPeer[] {
    return Array.from(this.peersByUserId.values()).filter(
      p => p.status === PeerStatus.ONLINE
    );
  }

  /**
   * Get all peers
   */
  getAllPeers(): RegisteredPeer[] {
    return Array.from(this.peersByUserId.values());
  }

  /**
   * Get peer count
   */
  getPeerCount(): number {
    return this.peersByUserId.size;
  }

  /**
   * Get online peer count
   */
  getOnlinePeerCount(): number {
    return this.getOnlinePeers().length;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // LAN MODE ADDITION – SAFE EXTENSION
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Get online peers with LAN context relative to requesting peer
   * 
   * LAN detection logic:
   * - If two peers share the same publicIpHash → mark as LAN
   * - Otherwise → mark as REMOTE
   * 
   * @param requestingUserId - The user requesting the peer list
   * @returns Peers with connectionMode set relative to requester
   */
  getOnlinePeersWithLanContext(requestingUserId: string): RegisteredPeer[] {
    const requestingPeer = this.peersByUserId.get(requestingUserId);
    const requesterIpHash = requestingPeer?.networkContext?.publicIpHash;

    return this.getOnlinePeers().map(peer => {
      // Don't modify the original peer object
      const peerCopy = { ...peer };
      
      // Determine connection mode relative to requester
      if (requesterIpHash && peerCopy.networkContext?.publicIpHash) {
        const isLan = peerCopy.networkContext.publicIpHash === requesterIpHash;
        peerCopy.networkContext = {
          ...peerCopy.networkContext,
          connectionMode: isLan ? ConnectionMode.LAN : ConnectionMode.REMOTE,
        };
      } else if (peerCopy.networkContext) {
        // No requester IP hash, default to REMOTE
        peerCopy.networkContext = {
          ...peerCopy.networkContext,
          connectionMode: ConnectionMode.REMOTE,
        };
      }
      
      return peerCopy;
    });
  }

  /**
   * Get online peers in the same invite-code network (for DISCOVER_PEERS).
   *
   * @param networkId - Invite-code network ID
   * @returns Peers in the same network
   */
  getOnlinePeersInNetwork(networkId: string): RegisteredPeer[] {
    return this.getOnlinePeers().filter(
      p => (p.networkId ?? null) === networkId,
    );
  }

  /**
   * Get only LAN peers (peers on the same network as requester)
   *
   * @param requestingUserId - The user requesting LAN peers
   * @returns Only peers that share the same IP hash
   */
  getLanPeers(requestingUserId: string): RegisteredPeer[] {
    const requestingPeer = this.peersByUserId.get(requestingUserId);
    const requesterIpHash = requestingPeer?.networkContext?.publicIpHash;

    if (!requesterIpHash) {
      this.logger.debug(`No IP hash for user ${requestingUserId}, returning empty LAN list`);
      return [];
    }

    return this.getOnlinePeers().filter(peer => {
      // Exclude self
      if (peer.userId === requestingUserId) return false;
      
      // Must have matching IP hash
      return peer.networkContext?.publicIpHash === requesterIpHash;
    }).map(peer => ({
      ...peer,
      networkContext: peer.networkContext ? {
        ...peer.networkContext,
        connectionMode: ConnectionMode.LAN,
      } : undefined,
    }));
  }

  /**
   * Update peer's network context (IP hash)
   * Called when IP might change (reconnection, etc.)
   */
  updatePeerNetworkContext(userId: string, ipHash: string): boolean {
    const peer = this.peersByUserId.get(userId);
    if (!peer) return false;

    peer.networkContext = {
      publicIpHash: ipHash,
      connectionMode: ConnectionMode.REMOTE, // Will be recalculated on discovery
    };
    peer.lastActivityAt = new Date();
    
    this.logger.debug(`Updated network context for user ${userId}`);
    return true;
  }

  /**
   * Check if two peers are on the same LAN
   */
  arePeersOnSameLan(userId1: string, userId2: string): boolean {
    const peer1 = this.peersByUserId.get(userId1);
    const peer2 = this.peersByUserId.get(userId2);

    if (!peer1?.networkContext?.publicIpHash || !peer2?.networkContext?.publicIpHash) {
      return false;
    }

    return peer1.networkContext.publicIpHash === peer2.networkContext.publicIpHash;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // END LAN MODE ADDITION
  // ═══════════════════════════════════════════════════════════════════════════════
}
