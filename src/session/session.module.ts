import { Module, Global } from '@nestjs/common';
import { SessionService } from './session.service';

/**
 * Session Module - Session lifecycle management
 */
@Global()
@Module({
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
