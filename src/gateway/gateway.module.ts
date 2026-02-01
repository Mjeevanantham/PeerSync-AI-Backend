import { Module } from '@nestjs/common';
import { PeerSyncGateway } from './peer-sync.gateway';
import { PeerModule } from '../peer';
import { SessionModule } from '../session';
import { MessagingModule } from '../messaging';
import { NetworkModule } from '../network';

/**
 * Gateway Module - WebSocket gateway
 */
@Module({
  imports: [PeerModule, SessionModule, MessagingModule, NetworkModule],
  providers: [PeerSyncGateway],
  exports: [PeerSyncGateway],
})
export class GatewayModule {}
