/**
 * WebSocket Event Types
 * 
 * Centralized event names for client-server communication.
 * These are the exact event names the frontend expects.
 */

export const WsEvents = {
  // Authentication
  AUTH: 'AUTH',
  AUTH_SUCCESS: 'AUTH_SUCCESS',
  AUTH_FAILED: 'AUTH_FAILED',

  // Peer Events
  PEER_REGISTER: 'PEER_REGISTER',
  PEER_REGISTERED: 'PEER_REGISTERED',
  PEER_STATUS_UPDATE: 'PEER_STATUS_UPDATE',
  PEER_DISCONNECTED: 'PEER_DISCONNECTED',

  // Discovery
  DISCOVER_PEERS: 'DISCOVER_PEERS',
  PEERS_LIST: 'PEERS_LIST',

  // Connection Request Flow
  CONNECTION_REQUEST: 'CONNECTION_REQUEST',
  CONNECTION_REQUEST_RECEIVED: 'CONNECTION_REQUEST_RECEIVED',
  CONNECTION_RESPONSE: 'CONNECTION_RESPONSE',
  CONNECTION_ACCEPTED: 'CONNECTION_ACCEPTED',
  CONNECTION_REJECTED: 'CONNECTION_REJECTED',

  // Session Events
  SESSION_CREATED: 'SESSION_CREATED',
  SESSION_ENDED: 'SESSION_ENDED',

  // Messaging
  SEND_MESSAGE: 'SEND_MESSAGE',
  MESSAGE_RECEIVED: 'MESSAGE_RECEIVED',

  // System
  ERROR: 'ERROR',
  PING: 'PING',
  PONG: 'PONG',
} as const;

export type WsEvent = (typeof WsEvents)[keyof typeof WsEvents];
