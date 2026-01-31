/**
 * Standardized error codes for the application
 */

export const ErrorCodes = {
  // Authentication errors (1xxx)
  AUTH_TOKEN_MISSING: 'ERR_1001',
  AUTH_TOKEN_INVALID: 'ERR_1002',
  AUTH_TOKEN_EXPIRED: 'ERR_1003',
  AUTH_INSUFFICIENT_PERMISSIONS: 'ERR_1004',
  AUTH_REQUIRED: 'ERR_1005',

  // Peer errors (2xxx)
  PEER_NOT_FOUND: 'ERR_2001',
  PEER_ALREADY_REGISTERED: 'ERR_2002',
  PEER_REGISTRATION_FAILED: 'ERR_2003',
  PEER_INVALID_STATUS: 'ERR_2004',
  PEER_ALREADY_CONNECTED: 'ERR_2005',
  PEER_NOT_REGISTERED: 'ERR_2006',

  // Session errors (3xxx)
  SESSION_NOT_FOUND: 'ERR_3001',
  SESSION_ALREADY_EXISTS: 'ERR_3002',
  SESSION_CREATION_FAILED: 'ERR_3003',
  SESSION_JOIN_DENIED: 'ERR_3004',
  SESSION_FULL: 'ERR_3005',
  SESSION_ENDED: 'ERR_3006',
  SESSION_INVALID_OPERATION: 'ERR_3007',
  SESSION_NOT_PARTICIPANT: 'ERR_3008',

  // Message errors (4xxx)
  MESSAGE_INVALID_FORMAT: 'ERR_4001',
  MESSAGE_ROUTING_FAILED: 'ERR_4002',
  MESSAGE_TARGET_OFFLINE: 'ERR_4003',
  MESSAGE_SESSION_MISMATCH: 'ERR_4004',

  // Connection request errors (6xxx)
  CONNECTION_REQUEST_NOT_FOUND: 'ERR_6001',
  CONNECTION_REQUEST_INVALID: 'ERR_6002',
  CONNECTION_REQUEST_EXPIRED: 'ERR_6003',
  CONNECTION_REQUEST_UNAUTHORIZED: 'ERR_6004',

  // WebSocket errors (5xxx)
  WS_CONNECTION_FAILED: 'ERR_5001',
  WS_AUTHENTICATION_FAILED: 'ERR_5002',
  WS_INVALID_MESSAGE: 'ERR_5003',
  WS_RATE_LIMITED: 'ERR_5004',
  WS_NOT_AUTHENTICATED: 'ERR_5005',

  // System errors (9xxx)
  INTERNAL_ERROR: 'ERR_9001',
  SERVICE_UNAVAILABLE: 'ERR_9002',
  VALIDATION_FAILED: 'ERR_9003',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Error messages mapped to error codes
 */
export const ErrorMessages: Record<ErrorCode, string> = {
  [ErrorCodes.AUTH_TOKEN_MISSING]: 'Authentication token is required',
  [ErrorCodes.AUTH_TOKEN_INVALID]: 'Authentication token is invalid',
  [ErrorCodes.AUTH_TOKEN_EXPIRED]: 'Authentication token has expired',
  [ErrorCodes.AUTH_INSUFFICIENT_PERMISSIONS]: 'Insufficient permissions for this action',
  [ErrorCodes.AUTH_REQUIRED]: 'Authentication required before this action',

  [ErrorCodes.PEER_NOT_FOUND]: 'Peer not found',
  [ErrorCodes.PEER_ALREADY_REGISTERED]: 'Peer is already registered',
  [ErrorCodes.PEER_REGISTRATION_FAILED]: 'Failed to register peer',
  [ErrorCodes.PEER_INVALID_STATUS]: 'Invalid peer status',
  [ErrorCodes.PEER_ALREADY_CONNECTED]: 'User already has an active connection',
  [ErrorCodes.PEER_NOT_REGISTERED]: 'Peer must be registered first',

  [ErrorCodes.SESSION_NOT_FOUND]: 'Session not found',
  [ErrorCodes.SESSION_ALREADY_EXISTS]: 'Session already exists',
  [ErrorCodes.SESSION_CREATION_FAILED]: 'Failed to create session',
  [ErrorCodes.SESSION_JOIN_DENIED]: 'Session join request was denied',
  [ErrorCodes.SESSION_FULL]: 'Session has reached maximum participants',
  [ErrorCodes.SESSION_ENDED]: 'Session has ended',
  [ErrorCodes.SESSION_INVALID_OPERATION]: 'Invalid session operation',
  [ErrorCodes.SESSION_NOT_PARTICIPANT]: 'You are not a participant in this session',

  [ErrorCodes.MESSAGE_INVALID_FORMAT]: 'Invalid message format',
  [ErrorCodes.MESSAGE_ROUTING_FAILED]: 'Failed to route message',
  [ErrorCodes.MESSAGE_TARGET_OFFLINE]: 'Target peer is offline',
  [ErrorCodes.MESSAGE_SESSION_MISMATCH]: 'Message session ID mismatch',

  [ErrorCodes.CONNECTION_REQUEST_NOT_FOUND]: 'Connection request not found',
  [ErrorCodes.CONNECTION_REQUEST_INVALID]: 'Invalid connection request',
  [ErrorCodes.CONNECTION_REQUEST_EXPIRED]: 'Connection request has expired',
  [ErrorCodes.CONNECTION_REQUEST_UNAUTHORIZED]: 'Not authorized to respond to this request',

  [ErrorCodes.WS_CONNECTION_FAILED]: 'WebSocket connection failed',
  [ErrorCodes.WS_AUTHENTICATION_FAILED]: 'WebSocket authentication failed',
  [ErrorCodes.WS_INVALID_MESSAGE]: 'Invalid WebSocket message',
  [ErrorCodes.WS_RATE_LIMITED]: 'Rate limit exceeded',
  [ErrorCodes.WS_NOT_AUTHENTICATED]: 'Socket not authenticated',

  [ErrorCodes.INTERNAL_ERROR]: 'Internal server error',
  [ErrorCodes.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable',
  [ErrorCodes.VALIDATION_FAILED]: 'Validation failed',
};
