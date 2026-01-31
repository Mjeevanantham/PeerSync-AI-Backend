/**
 * Message-related type definitions
 */

/**
 * Base outgoing message envelope
 */
export interface OutgoingMessage<T = unknown> {
  event: string;
  data: T;
}

/**
 * Base incoming message structure
 */
export interface IncomingMessage {
  event: string;
  data?: Record<string, unknown>;
}

/**
 * Error payload
 */
export interface ErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Peer profile for discovery/status
 */
export interface PeerProfile {
  displayName: string;
  role: string;
  ide: string;
}

/**
 * Peer info sent in events
 */
export interface PeerInfo {
  id: string;
  profile?: PeerProfile;
  status?: string;
}

/**
 * Connection request received payload
 */
export interface ConnectionRequestReceivedPayload {
  requestId: string;
  from: PeerInfo;
}

/**
 * Connection accepted payload
 */
export interface ConnectionAcceptedPayload {
  requestId: string;
  sessionId: string;
  peer: PeerInfo;
}

/**
 * Message received payload
 */
export interface MessageReceivedPayload {
  sessionId: string;
  from: string;
  content: unknown;
  type?: string;
  correlationId?: string;
  timestamp: string;
}
