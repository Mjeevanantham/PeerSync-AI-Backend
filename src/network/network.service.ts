import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../auth/supabase.service';

/**
 * Network (invite-code) info returned to client
 */
export interface NetworkInfo {
  id: string;
  inviteCode: string;
  createdBy: string;
  createdAt: string;
}

const INVITE_PREFIX = 'PS-';
const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O, 1/I
const INVITE_CODE_LENGTH = 6;

/**
 * Network Service
 *
 * Invite-code based discovery: users join a network via invite code.
 * Peer discovery is scoped ONLY to the same network.
 * - Generate short invite codes (e.g. PS-A9K7Q)
 * - Create network, join via invite code, leave, get active network
 * - Invite codes are case-insensitive; one active network per user (MVP)
 */
@Injectable()
export class NetworkService {
  private readonly logger = new Logger(NetworkService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  private get client() {
    return this.supabaseService.getClient();
  }

  /**
   * Generate a short, unique invite code (e.g. PS-A9K7Q)
   */
  private generateInviteCode(): string {
    let code = '';
    for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
      code += INVITE_CHARS.charAt(Math.floor(Math.random() * INVITE_CHARS.length));
    }
    return `${INVITE_PREFIX}${code}`;
  }

  /**
   * Normalize invite code for lookup (uppercase, trim)
   */
  private normalizeInviteCode(code: string): string {
    return code?.trim().toUpperCase() || '';
  }

  /**
   * Create a new network and add the user as member. Returns network info.
   */
  async createNetwork(userId: string): Promise<NetworkInfo> {
    const inviteCode = this.normalizeInviteCode(this.generateInviteCode());

    const { data: network, error: netError } = await this.client
      .from('networks')
      .insert({
        invite_code: inviteCode,
        created_by: userId,
      })
      .select('id, invite_code, created_by, created_at')
      .single();

    if (netError) {
      this.logger.warn(`[NETWORK] Create failed (retry once): ${netError.message}`);
      // Collision on unique invite_code is rare; retry once with new code
      const retryCode = this.generateInviteCode();
      const retry = await this.client
        .from('networks')
        .insert({ invite_code: retryCode, created_by: userId })
        .select('id, invite_code, created_by, created_at')
        .single();
      if (retry.error) {
        this.logger.error(`[NETWORK] Create retry failed: ${retry.error.message}`);
        throw new ConflictException('Failed to create network');
      }
      const n = retry.data as { id: string; invite_code: string; created_by: string; created_at: string };
      await this.client.from('network_members').insert({ network_id: n.id, user_id: userId });
      this.logger.log(`[NETWORK] Created networkId=${n.id} inviteCode=${n.invite_code} userId=${userId}`);
      return {
        id: n.id,
        inviteCode: n.invite_code,
        createdBy: n.created_by,
        createdAt: n.created_at,
      };
    }

    const n = network as { id: string; invite_code: string; created_by: string; created_at: string };
    await this.client.from('network_members').insert({ network_id: n.id, user_id: userId });
    this.logger.log(`[NETWORK] Created networkId=${n.id} inviteCode=${n.invite_code} userId=${userId}`);
    return {
      id: n.id,
      inviteCode: n.invite_code,
      createdBy: n.created_by,
      createdAt: n.created_at,
    };
  }

  /**
   * Join a network by invite code. User must leave current network first (one active per user).
   */
  async joinNetwork(userId: string, inviteCode: string): Promise<NetworkInfo> {
    const code = this.normalizeInviteCode(inviteCode);
    if (!code || !code.startsWith(INVITE_PREFIX)) {
      throw new ConflictException('Invalid invite code format');
    }

    const { data: network, error: findError } = await this.client
      .from('networks')
      .select('id, invite_code, created_by, created_at')
      .eq('invite_code', code)
      .maybeSingle();

    if (findError || !network) {
      this.logger.warn(`[NETWORK] Join failed: network not found for code=${code}`);
      throw new NotFoundException('Network not found for this invite code');
    }

    const n = network as { id: string; invite_code: string; created_by: string; created_at: string };

    // Leave any current network (one active per user)
    await this.client.from('network_members').delete().eq('user_id', userId);

    const { error: joinError } = await this.client
      .from('network_members')
      .insert({ network_id: n.id, user_id: userId });

    if (joinError) {
      this.logger.warn(`[NETWORK] Join insert failed: ${joinError.message}`);
      throw new ConflictException('Failed to join network');
    }

    this.logger.log(`[NETWORK] User joined networkId=${n.id} userId=${userId}`);
    return {
      id: n.id,
      inviteCode: n.invite_code,
      createdBy: n.created_by,
      createdAt: n.created_at,
    };
  }

  /**
   * Leave current network (removes membership only; network remains).
   */
  async leaveNetwork(userId: string): Promise<{ left: boolean }> {
    const { error } = await this.client
      .from('network_members')
      .delete()
      .eq('user_id', userId);

    if (error) {
      this.logger.warn(`[NETWORK] Leave failed: ${error.message}`);
      throw new ConflictException('Failed to leave network');
    }
    this.logger.log(`[NETWORK] User left network userId=${userId}`);
    return { left: true };
  }

  /**
   * Get the user's current network (if any). Used at WebSocket AUTH to attach networkId.
   */
  async getActiveNetworkId(userId: string): Promise<string | null> {
    const { data, error } = await this.client
      .from('network_members')
      .select('network_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }
    const row = data as { network_id: string };
    return row.network_id ?? null;
  }

  /**
   * Get full network info for the user's current network (for REST GET /network).
   */
  async getActiveNetwork(userId: string): Promise<NetworkInfo | null> {
    const { data: member, error: memError } = await this.client
      .from('network_members')
      .select('network_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (memError || !member) {
      return null;
    }
    const mid = (member as { network_id: string }).network_id;

    const { data: network, error: netError } = await this.client
      .from('networks')
      .select('id, invite_code, created_by, created_at')
      .eq('id', mid)
      .single();

    if (netError || !network) {
      return null;
    }
    const n = network as { id: string; invite_code: string; created_by: string; created_at: string };
    return {
      id: n.id,
      inviteCode: n.invite_code,
      createdBy: n.created_by,
      createdAt: n.created_at,
    };
  }
}
