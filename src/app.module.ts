import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth';
import { PeerModule } from './peer';
import { SessionModule } from './session';
import { MessagingModule } from './messaging';
import { GatewayModule } from './gateway';
import { configuration } from './config';

/**
 * PeerSync Dev Connect - Root Module
 * 
 * Backend serves as SINGLE source of truth for:
 * - Auth verification
 * - Peer presence
 * - Peer discovery
 * - Session lifecycle
 * - Message routing
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    AuthModule,
    PeerModule,
    SessionModule,
    MessagingModule,
    GatewayModule,
  ],
})
export class AppModule {}
