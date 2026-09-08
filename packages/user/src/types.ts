export interface User { id?: number; username: string; email: string; phone?: string | null; oidc_sub?: string | null; password_hash: string; email_verified: boolean; avatar_url: string; balance: string; group_id: number; referral_code?: string | null; referrer_id?: number | null; is_admin: boolean; created_at: string; updated_at: string; }
export interface UserAvatar { user_id: number; mime_type: string; data: Uint8Array; updated_at: string; }
export interface Group { id?: number; name: string; multiplier: string; created_at: string; updated_at: string; }
export interface UserGroupMembership { id?: number; user_id: number; group_id: number; expires_at?: string | null; created_at: string; updated_at: string; }
export interface UserChannel { id?: number; name: string; description: string; multiplier: string; routing_algorithm: string; enabled: boolean; rate_limit_enabled: boolean; rate_limit_requests_per_minute: number; rate_limit_burst: number; created_at: string; updated_at: string; }
export interface UserChannelGroupAccess { id?: number; user_channel_id: number; group_id: number; created_at: string; updated_at: string; }
export interface UserChannelUserAccess { id?: number; user_channel_id: number; user_id: number; created_at: string; updated_at: string; }
export interface CheckInRecord { id?: number; user_id: number; check_in_date: string; reward_amount: string; streak_days: number; reward_kind: string; created_at: string; }
