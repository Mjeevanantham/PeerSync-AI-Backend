import { Module } from '@nestjs/common';
import { NetworkService } from './network.service';
import { NetworkController } from './network.controller';

/**
 * Network Module
 *
 * Invite-code based peer discovery. Users join a network via invite code;
 * peer discovery is scoped only to the same network.
 */
@Module({
  controllers: [NetworkController],
  providers: [NetworkService],
  exports: [NetworkService],
})
export class NetworkModule {}
