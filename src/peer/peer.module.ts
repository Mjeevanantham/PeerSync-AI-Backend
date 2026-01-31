import { Module, Global } from '@nestjs/common';
import { PeerRegistryService } from './peer-registry.service';

/**
 * Peer Module - Peer registry management
 */
@Global()
@Module({
  providers: [PeerRegistryService],
  exports: [PeerRegistryService],
})
export class PeerModule {}
