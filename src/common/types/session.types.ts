/**
 * Session-related type definitions
 */

import { PeerRole } from './peer.types';

/**
 * Session status states
 */
export enum SessionStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  PAUSED = 'paused',
  ENDED = 'ended',
}

/**
 * Session participant information
 */
export interface SessionParticipant {
  userId: string;
  socketId: string;
  role: PeerRole;
  joinedAt: Date;
  lastActivityAt: Date;
}

/**
 * Collaboration session data
 */
export interface CollaborationSession {
  sessionId: string;
  hostUserId: string;
  participants: Map<string, SessionParticipant>;
  status: SessionStatus;
  createdAt: Date;
  lastActivityAt: Date;
  metadata?: SessionMetadata;
}

/**
 * Optional session metadata
 */
export interface SessionMetadata {
  name?: string;
  description?: string;
  projectName?: string;
  maxParticipants?: number;
  isPrivate?: boolean;
}

/**
 * Session creation payload
 */
export interface CreateSessionPayload {
  metadata?: SessionMetadata;
}

/**
 * Session approval payload
 */
export interface SessionApprovalPayload {
  sessionId: string;
  requestingUserId: string;
  approved: boolean;
  assignedRole?: PeerRole;
}
