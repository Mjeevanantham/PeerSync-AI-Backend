import { Module } from '@nestjs/common';
import { PeerSyncGateway } from './peer-sync.gateway';

/**
 * Gateway Module - WebSocket gateway
 */
@Module({
  providers: [PeerSyncGateway],
  exports: [PeerSyncGateway],
})
export class GatewayModule {}
