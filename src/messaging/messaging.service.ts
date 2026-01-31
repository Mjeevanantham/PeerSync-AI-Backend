import { Injectable, Logger } from '@nestjs/common';
import { WebSocket } from 'ws';

/**
 * Socket Registry Service
 * 
 * Manages WebSocket connections for message routing.
 * Backend is the source of truth for socket state.
 */
@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  /** Socket registry: socketId -> WebSocket */
  private readonly sockets: Map<string, WebSocket> = new Map();

  /**
   * Register a socket connection
   */
  registerSocket(socketId: string, socket: WebSocket): void {
    this.sockets.set(socketId, socket);
    this.logger.debug(`Socket registered: ${socketId}`);
  }

  /**
   * Unregister a socket connection
   */
  unregisterSocket(socketId: string): void {
    this.sockets.delete(socketId);
    this.logger.debug(`Socket unregistered: ${socketId}`);
  }

  /**
   * Get a socket by ID
   */
  getSocket(socketId: string): WebSocket | undefined {
    return this.sockets.get(socketId);
  }

  /**
   * Check if socket exists and is open
   */
  isSocketActive(socketId: string): boolean {
    const socket = this.sockets.get(socketId);
    return socket !== undefined && socket.readyState === WebSocket.OPEN;
  }

  /**
   * Get count of registered sockets
   */
  getSocketCount(): number {
    return this.sockets.size;
  }

  /**
   * Get statistics
   */
  getStats(): { connectedSockets: number } {
    return {
      connectedSockets: this.sockets.size,
    };
  }
}
