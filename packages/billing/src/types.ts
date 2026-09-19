export interface ModelPrice {
  id?: number;
  channel_id: number;
  model_config_id: number;
  model_name: string;
  channel_name?: string;
  quota_type: number;
  input_price: string;
  output_price: string;
  cached_input_price: string;
  cache_write_input_price: string;
  cache_write_1h_input_price: string;
  image_input_price: string;
  image_output_price: string;
  audio_input_price: string;
  audio_output_price: string;
  input_price_tiers: string;
  output_price_tiers: string;
  cached_input_price_tiers: string;
  cache_write_input_price_tiers: string;
  cache_write_1h_input_price_tiers: string;
  image_input_price_tiers: string;
  image_output_price_tiers: string;
  audio_input_price_tiers: string;
  audio_output_price_tiers: string;
  time_pricing: string;
  video_billing_config: string;
  updated_at: string;
  created_at: string;
}
export interface PaymentOrder { id?: number; order_no: string; user_id: number; amount: string; rmb_amount: string; exchange_rate: string; payment_currency: string; gateway_amount: string; method: string; status: string; gateway_provider: string; gateway_channel: string; gateway_trade_no: string; notify_payload: string; paid_at?: string | null; created_at: string; updated_at: string; }
export interface WalletTransaction { id?: number; user_id: number; source: string; idempotency_key: string; plugin_id: string; debit_amount: string; credit_amount: string; balance_before: string; balance_after: string; reference_type: string; reference_id: string; description: string; request_hash: string; metadata_json: string; created_at: string; }
export interface WalletLimitUsage { id?: number; wallet_transaction_id: number; user_id: number; source: string; limit_key: string; created_at: string; }
export interface ReferralCommissionLog { id?: number; referrer_id: number; referred_user_id: number; token_log_id: number; base_cost: string; rate: string; amount: string; created_at: string; }
export interface VideoTask { id: string; user_id: number; api_key_id?: number | null; user_channel_id?: number | null; channel_id: number; model_config_id: number; model_name: string; billing_model_name: string; upstream_task_id: string; status: string; cost: string; request_payload: string; response_payload: string; last_status_payload: string; created_at: string; updated_at: string; }
export interface TokenLog { id?: number; user_id: number; api_key_id?: number | null; user_channel_id?: number | null; channel_id: number; model_config_id: number; model_name: string; input_tokens: number; output_tokens: number; cached_input_tokens: number; cache_write_input_tokens: number; cache_write_1h_input_tokens: number; image_input_tokens: number; image_output_tokens: number; audio_input_tokens: number; audio_output_tokens: number; response_time_ms: number; first_response_time_ms: number; base_cost: string; group_multiplier: string; user_channel_multiplier: string; input_price: string; output_price: string; cached_input_price: string; cache_write_input_price: string; cache_write_1h_input_price: string; pricing_formula: string; cost: string; status: number; error_message: string; ip: string; user_agent: string; created_at: string; }
