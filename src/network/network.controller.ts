import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { SupabaseJwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { AuthenticatedUser } from '../common/types';
import { NetworkService, NetworkInfo } from './network.service';

/**
 * Network Controller
 *
 * REST API for invite-code based networks.
 * Uses SupabaseJwtAuthGuard so token verification matches WebSocket AUTH.
 */
@Controller('network')
@UseGuards(SupabaseJwtAuthGuard)
export class NetworkController {
  constructor(private readonly networkService: NetworkService) {}

  /**
   * Create a new network; user auto-joins. Returns invite code.
   */
  @Post()
  async create(@CurrentUser() user: AuthenticatedUser): Promise<NetworkInfo> {
    return this.networkService.createNetwork(user.userId);
  }

  /**
   * Join a network by invite code.
   */
  @Post('join')
  async join(
    @CurrentUser() user: AuthenticatedUser,
    @Body('inviteCode') inviteCode: string,
  ): Promise<NetworkInfo> {
    return this.networkService.joinNetwork(user.userId, inviteCode ?? '');
  }

  /**
   * Leave current network.
   */
  @Post('leave')
  async leave(@CurrentUser() user: AuthenticatedUser): Promise<{ left: boolean }> {
    return this.networkService.leaveNetwork(user.userId);
  }

  /**
   * Get current network (if any).
   */
  @Get()
  async getActive(@CurrentUser() user: AuthenticatedUser): Promise<NetworkInfo | null> {
    return this.networkService.getActiveNetwork(user.userId);
  }
}
