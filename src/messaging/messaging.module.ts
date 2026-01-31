import { Module, Global } from '@nestjs/common';
import { MessagingService } from './messaging.service';

/**
 * Messaging Module - Socket registry
 */
@Global()
@Module({
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
