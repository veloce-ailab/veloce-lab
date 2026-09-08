export interface EmailVerificationCode { id?: number; email: string; code_hash: string; purpose: string; hcaptcha_verified: boolean; expires_at: string; used_at?: string | null; created_at: string; }
export interface PhoneVerificationCode { id?: number; phone: string; code_hash: string; purpose: string; hcaptcha_verified: boolean; expires_at: string; used_at?: string | null; created_at: string; }
export interface OIDCBindRequest { state: string; user_id: number; expires_at: string; created_at: string; }
export interface WebAuthnChallenge { id?: number; challenge: string; purpose: string; user_id?: number | null; rp_id: string; origin: string; expires_at: string; created_at: string; }
export interface PasskeyCredential { id?: number; user_id: number; name: string; credential_id: string; public_key_cose: string; aaguid: string; sign_count: number; last_used_at?: string | null; created_at: string; updated_at: string; }
