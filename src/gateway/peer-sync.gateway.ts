import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { WebSocket, Server, RawData } from 'ws';
import { IncomingMessage } from 'http';
import { AuthService } from '../auth';
import { PeerRegistryService } from '../peer';
import { NetworkService } from '../network';
import { SessionService } from '../session';
import { MessagingService } from '../messaging';
import { AuthenticatedUser, WsEvents, IdeType, PeerRole, PeerStatus, ConnectionMode } from '../common/types';
import { ErrorCodes, ErrorMessages } from '../common/constants';
import { generateSocketId, hashIpAddress, extractClientIp } from '../common/utils';

/**
 * Socket state tracking
 */
interface SocketState {
  socketId: string;
  isAuthenticated: boolean;
  isRegistered: boolean;
  user: AuthenticatedUser | null;
  isAlive: boolean;
  connectedAt: Date;
  /** Invite-code network ID; peer discovery scoped to same network */
  networkId: string | null;
  // ═══════════════════════════════════════════════════════════════════════════
  // LAN MODE ADDITION – SAFE EXTENSION
  // ═══════════════════════════════════════════════════════════════════════════
  /** Hashed client IP for LAN detection (never store raw IP) */
  ipHash?: string;
  // ═══════════════════════════════════════════════════════════════════════════
}

/**
 * Extended WebSocket with state
 */
interface PeerSocket extends WebSocket {
  state: SocketState;
}

/**
 * Incoming message structure
 */
interface IncomingWsMessage {
  event: string;
  data?: Record<string, unknown>;
}

/**
 * PeerSync WebSocket Gateway
 * 
 * Strict authentication flow:
 * 1. Client connects (socket created but NOT authenticated)
 * 2. Client MUST send AUTH event with token
 * 3. Server validates and emits AUTH_SUCCESS or AUTH_FAILED
 * 4. Only authenticated sockets can perform other actions
 */
@WebSocketGateway({
  path: '/ws',
  transports: ['websocket'],
})
export class PeerSyncGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(PeerSyncGateway.name);
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly AUTH_TIMEOUT_MS = 10000;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly authService: AuthService,
    private readonly peerRegistry: PeerRegistryService,
    private readonly networkService: NetworkService,
    private readonly sessionService: SessionService,
    private readonly messagingService: MessagingService,
  ) {}

  afterInit(): void {
    this.logger.log('WebSocket Gateway initialized');
    this.heartbeatInterval = setInterval(() => this.checkHeartbeats(), 30000);
  }

  /**
   * Handle new connection - socket is NOT authenticated yet
   */
  handleConnection(client: WebSocket, request: IncomingMessage): void {
    const socket = client as PeerSocket;
    
    // ═══════════════════════════════════════════════════════════════════════════
    // LAN MODE ADDITION – SAFE EXTENSION
    // Capture and hash client IP on connection for LAN detection
    // Raw IP is NEVER stored - only the hash is kept
    // ═══════════════════════════════════════════════════════════════════════════
    const forwardedFor = request.headers['x-forwarded-for'] as string | undefined;
    const remoteAddress = request.socket?.remoteAddress;
    const clientIp = extractClientIp(remoteAddress, forwardedFor);
    const ipHash = hashIpAddress(clientIp);
    // ═══════════════════════════════════════════════════════════════════════════
    
    socket.state = {
      socketId: generateSocketId(),
      isAuthenticated: false,
      isRegistered: false,
      user: null,
      isAlive: true,
      connectedAt: new Date(),
      networkId: null,
      ipHash, // LAN MODE ADDITION
    };

    // [DEBUG] WebSocket connection established
    this.logger.log(`[WS] Connection opened | socketId=${socket.state.socketId} | ipHash=${ipHash?.slice(0, 8)}... | awaiting AUTH`);

    // Set up message handler
    socket.on('message', (data: RawData) => this.handleMessage(socket, data));
    socket.on('pong', () => { socket.state.isAlive = true; });

    // Auto-close if not authenticated within timeout
    setTimeout(() => {
      if (!socket.state.isAuthenticated && socket.readyState === WebSocket.OPEN) {
        this.logger.warn(`Auth timeout: ${socket.state.socketId}`);
        this.emitError(socket, ErrorCodes.AUTH_TOKEN_MISSING, 'Authentication timeout');
        socket.close(4001, 'Authentication timeout');
      }
    }, this.AUTH_TIMEOUT_MS);
  }

  /**
   * Handle disconnection
   */
  handleDisconnect(client: WebSocket): void {
    const socket = client as PeerSocket;
    const { socketId, user, isRegistered } = socket.state;

    if (user && isRegistered) {
      this.logger.log(`Peer disconnected: userId=${user.userId}`);
      
      // Clean up sessions
      this.sessionService.handleUserDisconnect(user.userId);
      
      // Unregister peer
      this.peerRegistry.unregisterPeerByUserId(user.userId);
      
      // Unregister socket
      this.messagingService.unregisterSocket(socketId);
      
      // Broadcast offline status
      this.broadcastPeerStatus(user.userId, PeerStatus.OFFLINE);
    }
  }

  /**
   * Central message router
   */
  private handleMessage(socket: PeerSocket, rawData: RawData): void {
    let message: IncomingWsMessage;

    try {
      message = JSON.parse(rawData.toString()) as IncomingWsMessage;
    } catch {
      this.logger.warn(`[WS] Invalid JSON | socketId=${socket.state.socketId}`);
      this.emitError(socket, ErrorCodes.WS_INVALID_MESSAGE, 'Invalid JSON');
      return;
    }

    const { event, data } = message;
    // [DEBUG] Route event (skip PING for log noise)
    if (event !== WsEvents.PING) {
      this.logger.debug(`[WS] Event | event=${event} | socketId=${socket.state.socketId} | authenticated=${socket.state.isAuthenticated}`);
    }

    // AUTH event is allowed before authentication
    if (event === WsEvents.AUTH) {
      this.handleAuth(socket, data);
      return;
    }

    // All other events require authentication
    if (!socket.state.isAuthenticated) {
      this.emitError(socket, ErrorCodes.WS_NOT_AUTHENTICATED, 'Must authenticate first');
      return;
    }

    // Route to appropriate handler
    switch (event) {
      case WsEvents.PEER_REGISTER:
        this.handlePeerRegister(socket, data);
        break;
      case WsEvents.DISCOVER_PEERS:
        this.handleDiscoverPeers(socket, data);
        break;
      case WsEvents.CONNECTION_REQUEST:
        this.handleConnectionRequest(socket, data);
        break;
      case WsEvents.CONNECTION_RESPONSE:
        this.handleConnectionResponse(socket, data);
        break;
      case WsEvents.SEND_MESSAGE:
        this.handleSendMessage(socket, data);
        break;
      case WsEvents.PING:
        this.handlePing(socket);
        break;
      default:
        this.emitError(socket, ErrorCodes.WS_INVALID_MESSAGE, `Unknown event: ${event}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: AUTH FLOW
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle AUTH event
   */
  private async handleAuth(
    socket: PeerSocket,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const token = data?.token as string | undefined;

    // [DEBUG] Auth attempt
    this.logger.debug(`[WS] AUTH attempt | socketId=${socket.state.socketId} | tokenPresent=${!!token}`);

    if (!token) {
      this.logger.warn(`[WS] AUTH failed | socketId=${socket.state.socketId} | reason=no token`);
      this.emit(socket, WsEvents.AUTH_FAILED, {
        code: ErrorCodes.AUTH_TOKEN_MISSING,
        message: ErrorMessages[ErrorCodes.AUTH_TOKEN_MISSING],
      });
      socket.close(4001, 'No token provided');
      return;
    }

    try {
      this.logger.debug(`[WS] AUTH validating token | socketId=${socket.state.socketId}`);
      const user = await this.authService.validateWsToken(token);
      this.logger.debug(`[WS] AUTH token valid | userId=${user.userId} | provider=${user.provider || 'unknown'}`);

      // Check for duplicate connection
      if (this.peerRegistry.isPeerRegistered(user.userId)) {
        const existingPeer = this.peerRegistry.getPeerByUserId(user.userId);
        if (existingPeer.found && existingPeer.peer) {
          // Close the old connection
          const oldSocket = this.messagingService.getSocket(existingPeer.peer.socketId);
          if (oldSocket) {
            this.emitError(
              oldSocket as PeerSocket,
              ErrorCodes.PEER_ALREADY_CONNECTED,
              'New connection established from another client',
            );
            oldSocket.close(4002, 'Superseded by new connection');
          }
          this.peerRegistry.unregisterPeerByUserId(user.userId);
          this.messagingService.unregisterSocket(existingPeer.peer.socketId);
        }
      }

      // Mark socket as authenticated
      socket.state.isAuthenticated = true;
      socket.state.user = user;

      // Fetch user's active network and attach to socket (invite-code discovery)
      try {
        socket.state.networkId = await this.networkService.getActiveNetworkId(user.userId);
        this.logger.debug(`[WS] AUTH networkId=${socket.state.networkId ?? 'none'} | userId=${user.userId}`);
      } catch (err) {
        this.logger.warn(`[WS] AUTH failed to fetch networkId | userId=${user.userId}`, err);
        socket.state.networkId = null;
      }

      // Register socket for messaging
      this.messagingService.registerSocket(socket.state.socketId, socket);

      this.logger.log(`[WS] AUTH success | userId=${user.userId} | displayName=${user.displayName} | networkId=${socket.state.networkId ?? 'none'} | socketId=${socket.state.socketId}`);

      this.emit(socket, WsEvents.AUTH_SUCCESS, {
        userId: user.userId,
        displayName: user.displayName,
        email: user.email,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid token';
      this.logger.warn(`[WS] AUTH failed | socketId=${socket.state.socketId} | error=${errorMessage}`);

      this.emit(socket, WsEvents.AUTH_FAILED, {
        code: ErrorCodes.AUTH_TOKEN_INVALID,
        message: errorMessage,
      });
      socket.close(4001, 'Authentication failed');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: PEER REGISTRY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle PEER_REGISTER event
   */
  private handlePeerRegister(
    socket: PeerSocket,
    data?: Record<string, unknown>,
  ): void {
    const user = socket.state.user!;
    const displayName = (data?.displayName as string) || user.displayName;
    const ide = (data?.ide as IdeType) || IdeType.OTHER;
    const role = (data?.role as PeerRole) || PeerRole.GUEST;
    const networkId = socket.state.networkId ?? undefined;

    const peer = this.peerRegistry.registerPeer(
      user.userId,
      { displayName, ide, role },
      socket.state.socketId,
      socket.state.ipHash,
      networkId,
    );

    socket.state.isRegistered = true;

    this.logger.log(`Peer registered: userId=${user.userId}, ide=${ide}, networkId=${networkId ?? 'none'}`);

    // Notify the registering peer
    this.emit(socket, WsEvents.PEER_REGISTERED, {
      id: peer.userId,
      profile: {
        displayName: peer.displayName,
        role: peer.role,
        ide: peer.ide,
      },
      status: peer.status,
    });

    // Broadcast online status to all other peers
    this.broadcastPeerStatus(user.userId, PeerStatus.ONLINE);
  }

  /**
   * Broadcast peer status update to all online peers
   */
  private broadcastPeerStatus(userId: string, status: PeerStatus): void {
    const peer = this.peerRegistry.getPeerByUserId(userId);
    const onlinePeers = this.peerRegistry.getOnlinePeers();

    for (const otherPeer of onlinePeers) {
      if (otherPeer.userId !== userId) {
        const otherSocket = this.messagingService.getSocket(otherPeer.socketId);
        if (otherSocket) {
          // ═══════════════════════════════════════════════════════════════════════
          // LAN MODE ADDITION – Include connectionMode relative to receiving peer
          // ═══════════════════════════════════════════════════════════════════════
          const isLan = this.peerRegistry.arePeersOnSameLan(userId, otherPeer.userId);
          const connectionMode = isLan ? ConnectionMode.LAN : ConnectionMode.REMOTE;
          // ═══════════════════════════════════════════════════════════════════════
          
          this.emit(otherSocket as PeerSocket, WsEvents.PEER_STATUS_UPDATE, {
            id: userId,
            profile: peer.found && peer.peer ? {
              displayName: peer.peer.displayName,
              role: peer.peer.role,
              ide: peer.peer.ide,
            } : undefined,
            status,
            connectionMode, // LAN MODE ADDITION
          });
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: PEER DISCOVERY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle DISCOVER_PEERS event
   *
   * Invite-code discovery: return ONLY peers in the same network.
   * Do NOT filter by IDE, Wi-Fi, IP, or role.
   */
  private handleDiscoverPeers(
    socket: PeerSocket,
    _data?: Record<string, unknown>,
  ): void {
    if (!this.requireRegistered(socket)) return;

    const userId = socket.state.user!.userId;
    const networkId = socket.state.networkId;

    if (networkId == null) {
      this.logger.debug(`[WS] DISCOVER_PEERS: no networkId for userId=${userId}, returning empty list`);
      this.emit(socket, WsEvents.PEERS_LIST, { peers: [] });
      return;
    }

    const peers = this.peerRegistry.getOnlinePeersInNetwork(networkId);
    const peerList = peers
      .filter(p => p.userId !== userId)
      .map(p => ({
        id: p.userId,
        profile: {
          displayName: p.displayName,
          role: p.role,
          ide: p.ide,
        },
        status: p.status,
        connectionMode: p.networkContext?.connectionMode || ConnectionMode.REMOTE,
      }));

    this.logger.debug(`[WS] DISCOVER_PEERS: networkId=${networkId} userId=${userId} count=${peerList.length}`);
    this.emit(socket, WsEvents.PEERS_LIST, { peers: peerList });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: CONNECTION REQUEST FLOW
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle CONNECTION_REQUEST event
   * Allow only if sender and receiver are in the same network.
   */
  private handleConnectionRequest(
    socket: PeerSocket,
    data?: Record<string, unknown>,
  ): void {
    if (!this.requireRegistered(socket)) return;

    const fromUserId = socket.state.user!.userId;
    const fromNetworkId = socket.state.networkId;
    const toUserId = data?.targetId as string;

    if (!toUserId) {
      this.emitError(socket, ErrorCodes.VALIDATION_FAILED, 'targetId is required');
      return;
    }

    // Find target peer
    const targetPeer = this.peerRegistry.getPeerByUserId(toUserId);
    if (!targetPeer.found || !targetPeer.peer) {
      this.emitError(socket, ErrorCodes.PEER_NOT_FOUND, 'Target peer not found');
      return;
    }

    // Same-network validation: allow CONNECTION_REQUEST only if in same network
    const targetNetworkId = targetPeer.peer.networkId ?? null;
    if (fromNetworkId !== targetNetworkId) {
      this.logger.warn(`[WS] CONNECTION_REQUEST rejected: not in same network | from=${fromUserId} to=${toUserId}`);
      this.emitError(socket, ErrorCodes.PEER_NOT_IN_SAME_NETWORK, 'Peer is not in your network');
      return;
    }

    const targetSocket = this.messagingService.getSocket(targetPeer.peer.socketId);
    if (!targetSocket) {
      this.emitError(socket, ErrorCodes.MESSAGE_TARGET_OFFLINE, 'Target peer offline');
      return;
    }

    // Get requester profile
    const fromPeer = this.peerRegistry.getPeerByUserId(fromUserId);
    const requestId = this.sessionService.createConnectionRequest(fromUserId, toUserId);

    this.logger.debug(`Connection request: ${fromUserId} -> ${toUserId}, requestId=${requestId}`);

    // Forward request to target
    this.emit(targetSocket as PeerSocket, WsEvents.CONNECTION_REQUEST_RECEIVED, {
      requestId,
      from: {
        id: fromUserId,
        profile: fromPeer.peer ? {
          displayName: fromPeer.peer.displayName,
          role: fromPeer.peer.role,
          ide: fromPeer.peer.ide,
        } : undefined,
      },
    });
  }

  /**
   * Handle CONNECTION_RESPONSE event
   */
  private handleConnectionResponse(
    socket: PeerSocket,
    data?: Record<string, unknown>,
  ): void {
    if (!this.requireRegistered(socket)) return;

    const responderId = socket.state.user!.userId;
    const requestId = data?.requestId as string;
    const accepted = data?.accepted as boolean;

    if (!requestId || accepted === undefined) {
      this.emitError(socket, ErrorCodes.VALIDATION_FAILED, 'requestId and accepted required');
      return;
    }

    // Validate and process the request
    const request = this.sessionService.getConnectionRequest(requestId);
    if (!request) {
      this.emitError(socket, ErrorCodes.CONNECTION_REQUEST_NOT_FOUND, 'Request not found or expired');
      return;
    }

    // Verify responder is the target
    if (request.toUserId !== responderId) {
      this.emitError(socket, ErrorCodes.CONNECTION_REQUEST_UNAUTHORIZED, 'Not authorized');
      return;
    }

    // Remove the request
    this.sessionService.removeConnectionRequest(requestId);

    // Find requester socket
    const requesterPeer = this.peerRegistry.getPeerByUserId(request.fromUserId);
    if (!requesterPeer.found || !requesterPeer.peer) {
      this.emitError(socket, ErrorCodes.PEER_NOT_FOUND, 'Requester no longer online');
      return;
    }

    const requesterSocket = this.messagingService.getSocket(requesterPeer.peer.socketId);
    if (!requesterSocket) {
      this.emitError(socket, ErrorCodes.MESSAGE_TARGET_OFFLINE, 'Requester offline');
      return;
    }

    if (accepted) {
      // Create session for both peers
      const session = this.sessionService.createSessionForPeers(
        request.fromUserId,
        requesterPeer.peer.socketId,
        responderId,
        socket.state.socketId,
      );

      const responderPeer = this.peerRegistry.getPeerByUserId(responderId);

      // Notify requester (the one who initiated)
      this.emit(requesterSocket as PeerSocket, WsEvents.CONNECTION_ACCEPTED, {
        requestId,
        sessionId: session.sessionId,
        peer: {
          id: responderId,
          profile: responderPeer.peer ? {
            displayName: responderPeer.peer.displayName,
            role: responderPeer.peer.role,
            ide: responderPeer.peer.ide,
          } : undefined,
        },
      });

      // Notify responder
      this.emit(socket, WsEvents.SESSION_CREATED, {
        sessionId: session.sessionId,
        peer: {
          id: request.fromUserId,
          profile: {
            displayName: requesterPeer.peer.displayName,
            role: requesterPeer.peer.role,
            ide: requesterPeer.peer.ide,
          },
        },
      });

      this.logger.log(`Session created: ${session.sessionId} (${request.fromUserId} <-> ${responderId})`);
    } else {
      // Notify requester of rejection
      this.emit(requesterSocket as PeerSocket, WsEvents.CONNECTION_REJECTED, {
        requestId,
        targetId: responderId,
      });

      this.logger.debug(`Connection rejected: ${request.fromUserId} <- ${responderId}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 6: MESSAGE ROUTING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle SEND_MESSAGE event
   */
  private handleSendMessage(
    socket: PeerSocket,
    data?: Record<string, unknown>,
  ): void {
    if (!this.requireRegistered(socket)) return;

    const senderId = socket.state.user!.userId;
    const sessionId = data?.sessionId as string;
    const content = data?.content;
    const messageType = data?.type as string | undefined;
    const correlationId = data?.correlationId as string | undefined;

    if (!sessionId) {
      this.emitError(socket, ErrorCodes.VALIDATION_FAILED, 'sessionId is required');
      return;
    }

    // Validate session exists
    const session = this.sessionService.getSession(sessionId);
    if (!session) {
      this.emitError(socket, ErrorCodes.SESSION_NOT_FOUND, 'Session not found');
      return;
    }

    // Validate sender is participant
    if (!this.sessionService.isParticipant(sessionId, senderId)) {
      this.emitError(socket, ErrorCodes.SESSION_NOT_PARTICIPANT, 'Not a session participant');
      return;
    }

    // Get the other participant(s) and route the message
    const participants = this.sessionService.getSessionParticipants(sessionId);
    
    for (const participant of participants) {
      if (participant.userId !== senderId) {
        const targetSocket = this.messagingService.getSocket(participant.socketId);
        if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
          this.emit(targetSocket as PeerSocket, WsEvents.MESSAGE_RECEIVED, {
            sessionId,
            from: senderId,
            content,
            type: messageType,
            correlationId,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    // Update session activity
    this.sessionService.updateParticipantActivity(sessionId, senderId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 8: HEARTBEAT / PING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle PING event
   */
  private handlePing(socket: PeerSocket): void {
    socket.state.isAlive = true;
    if (socket.state.user) {
      this.peerRegistry.updatePeerActivity(socket.state.user.userId);
    }
    this.emit(socket, WsEvents.PONG, { timestamp: Date.now() });
  }

  /**
   * Check heartbeats and terminate dead connections
   */
  private checkHeartbeats(): void {
    if (!this.server?.clients) return;

    this.server.clients.forEach((ws) => {
      const socket = ws as PeerSocket;
      if (!socket.state) return;

      if (!socket.state.isAlive) {
        this.logger.debug(`Terminating dead connection: ${socket.state.socketId}`);
        socket.terminate();
        return;
      }

      socket.state.isAlive = false;
      socket.ping();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Require socket to be registered
   */
  private requireRegistered(socket: PeerSocket): boolean {
    if (!socket.state.isRegistered) {
      this.emitError(socket, ErrorCodes.PEER_NOT_REGISTERED, 'Must register first');
      return false;
    }
    return true;
  }

  /**
   * Emit event to socket
   */
  private emit(socket: PeerSocket | WebSocket, event: string, data: unknown): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ event, data }));
    }
  }

  /**
   * Emit error to socket
   */
  private emitError(socket: PeerSocket | WebSocket, code: string, message: string): void {
    this.emit(socket, WsEvents.ERROR, { code, message });
  }

  /**
   * Clean up on module destroy
   */
  onModuleDestroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }
}
