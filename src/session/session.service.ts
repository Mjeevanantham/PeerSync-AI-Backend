import { Injectable, Logger } from '@nestjs/common';
import {
  CollaborationSession,
  SessionParticipant,
  SessionStatus,
  PeerRole,
} from '../common/types';
import { generateSessionId } from '../common/utils';
import { PeerRegistryService } from '../peer';

/**
 * Connection request tracking
 */
interface ConnectionRequest {
  requestId: string;
  fromUserId: string;
  toUserId: string;
  createdAt: Date;
}

/**
 * Session Management Service
 * 
 * Backend is the SINGLE source of truth for:
 * - Connection requests
 * - Session creation
 * - Session membership
 * - Session lifecycle
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  /** Active sessions by sessionId */
  private readonly sessions: Map<string, CollaborationSession> = new Map();

  /** Pending connection requests: requestId -> ConnectionRequest */
  private readonly connectionRequests: Map<string, ConnectionRequest> = new Map();

  /** Request expiration time (30 seconds) */
  private readonly REQUEST_EXPIRY_MS = 30000;

  constructor(private readonly peerRegistry: PeerRegistryService) {
    // Clean up expired requests periodically
    setInterval(() => this.cleanupExpiredRequests(), 10000);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTION REQUESTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new connection request
   */
  createConnectionRequest(fromUserId: string, toUserId: string): string {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    this.connectionRequests.set(requestId, {
      requestId,
      fromUserId,
      toUserId,
      createdAt: new Date(),
    });

    this.logger.debug(`Connection request created: ${requestId}`);

    return requestId;
  }

  /**
   * Get a connection request by ID
   */
  getConnectionRequest(requestId: string): ConnectionRequest | undefined {
    const request = this.connectionRequests.get(requestId);
    
    if (!request) return undefined;

    // Check if expired
    const age = Date.now() - request.createdAt.getTime();
    if (age > this.REQUEST_EXPIRY_MS) {
      this.connectionRequests.delete(requestId);
      return undefined;
    }

    return request;
  }

  /**
   * Remove a connection request
   */
  removeConnectionRequest(requestId: string): void {
    this.connectionRequests.delete(requestId);
  }

  /**
   * Clean up expired requests
   */
  private cleanupExpiredRequests(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [requestId, request] of this.connectionRequests) {
      if (now - request.createdAt.getTime() > this.REQUEST_EXPIRY_MS) {
        this.connectionRequests.delete(requestId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired connection request(s)`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a session for two peers (after connection accepted)
   */
  createSessionForPeers(
    user1Id: string,
    user1SocketId: string,
    user2Id: string,
    user2SocketId: string,
  ): CollaborationSession {
    const sessionId = generateSessionId();
    const now = new Date();

    const participant1: SessionParticipant = {
      userId: user1Id,
      socketId: user1SocketId,
      role: PeerRole.HOST,
      joinedAt: now,
      lastActivityAt: now,
    };

    const participant2: SessionParticipant = {
      userId: user2Id,
      socketId: user2SocketId,
      role: PeerRole.GUEST,
      joinedAt: now,
      lastActivityAt: now,
    };

    const session: CollaborationSession = {
      sessionId,
      hostUserId: user1Id,
      participants: new Map([
        [user1Id, participant1],
        [user2Id, participant2],
      ]),
      status: SessionStatus.ACTIVE,
      createdAt: now,
      lastActivityAt: now,
    };

    this.sessions.set(sessionId, session);

    // Update peer records
    this.peerRegistry.addSessionToPeer(user1Id, sessionId);
    this.peerRegistry.addSessionToPeer(user2Id, sessionId);

    this.logger.log(`Session created: ${sessionId} with ${user1Id} and ${user2Id}`);

    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): CollaborationSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Check if session exists
   */
  sessionExists(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Check if user is a participant
   */
  isParticipant(sessionId: string, userId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.participants.has(userId) ?? false;
  }

  /**
   * Check if user is the session host
   */
  isSessionHost(sessionId: string, userId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.hostUserId === userId;
  }

  /**
   * Get all participants in a session
   */
  getSessionParticipants(sessionId: string): SessionParticipant[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return Array.from(session.participants.values());
  }

  /**
   * Get socket IDs for session participants
   */
  getSessionSocketIds(sessionId: string, excludeUserId?: string): string[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const socketIds: string[] = [];
    for (const [userId, participant] of session.participants) {
      if (!excludeUserId || userId !== excludeUserId) {
        socketIds.push(participant.socketId);
      }
    }
    return socketIds;
  }

  /**
   * Update participant activity
   */
  updateParticipantActivity(sessionId: string, userId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const participant = session.participants.get(userId);
    if (!participant) return false;

    participant.lastActivityAt = new Date();
    session.lastActivityAt = new Date();

    return true;
  }

  /**
   * Remove participant from session
   */
  removeParticipant(sessionId: string, userId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const removed = session.participants.delete(userId);
    if (removed) {
      this.peerRegistry.removeSessionFromPeer(userId, sessionId);
      session.lastActivityAt = new Date();

      // If session is empty or host left, end it
      if (session.participants.size === 0 || userId === session.hostUserId) {
        this.endSession(sessionId);
      }
    }

    return removed;
  }

  /**
   * End a session
   */
  endSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.status = SessionStatus.ENDED;

    // Remove from all participant records
    for (const [userId] of session.participants) {
      this.peerRegistry.removeSessionFromPeer(userId, sessionId);
    }

    this.sessions.delete(sessionId);
    this.logger.log(`Session ended: ${sessionId}`);

    return true;
  }

  /**
   * Handle user disconnect - clean up all their sessions and requests
   */
  handleUserDisconnect(userId: string): void {
    // Remove from all active sessions
    for (const [sessionId, session] of this.sessions) {
      if (session.participants.has(userId)) {
        this.removeParticipant(sessionId, userId);
      }
    }

    // Remove any pending connection requests involving this user
    for (const [requestId, request] of this.connectionRequests) {
      if (request.fromUserId === userId || request.toUserId === userId) {
        this.connectionRequests.delete(requestId);
      }
    }
  }

  /**
   * Get user's active sessions
   */
  getUserSessions(userId: string): CollaborationSession[] {
    return Array.from(this.sessions.values()).filter(
      s => s.participants.has(userId) && s.status === SessionStatus.ACTIVE
    );
  }

  /**
   * Get statistics
   */
  getStats(): { sessions: number; requests: number } {
    return {
      sessions: this.sessions.size,
      requests: this.connectionRequests.size,
    };
  }
}
