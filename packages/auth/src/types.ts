export interface EmailVerificationCode { id?: number; email: string; code_hash: string; purpose: string; hcaptcha_verified: boolean; expires_at: string; used_at?: string | null; created_at: string; }
export interface PhoneVerificationCode { id?: number; phone: string; code_hash: string; purpose: string; hcaptcha_verified: boolean; expires_at: string; used_at?: string | null; created_at: string; }
export interface OIDCBindRequest { state: string; user_id: number; expires_at: string; created_at: string; }
export interface WebAuthnChallenge { id?: number; challenge: string; purpose: string; user_id?: number | null; rp_id: string; origin: string; expires_at: string; created_at: string; }
export interface PasskeyCredential { id?: number; user_id: number; name: string; credential_id: string; public_key_cose: string; aaguid: string; sign_count: number; last_used_at?: string | null; created_at: string; updated_at: string; }

/** A stable external identity binding owned by the auth plugin. */
export interface AuthIdentity {
  id?: number;
  user_id: number;
  provider: string;
  subject: string;
  email_at_link_time?: string | null;
  profile_json?: string | null;
  created_at: string;
  updated_at: string;
}

/** A short-lived authorization transaction. Provider plugins may use its id as state. */
export interface AuthTransaction {
  id: string;
  type: "login" | "bind" | "registration";
  provider: string;
  user_id?: number | null;
  return_to?: string | null;
  verifier_hash?: string | null;
  nonce?: string | null;
  expires_at: string;
  consumed_at?: string | null;
  created_at: string;
}

/** Metadata a third-party authentication plugin publishes to auth. */
export interface AuthProvider {
  id: string;
  displayName: string;
  icon?: string;
  /** A provider must hide itself until its own credentials/configuration are usable. */
  available(): boolean;
  /** A provider can forbid first-use account creation independently of the global policy. */
  registrationEnabled?(): boolean;
}

/** A provider's verified, provider-stable identity. Never pass access tokens here. */
export interface ExternalIdentity {
  provider: string;
  subject: string;
  email?: string;
  emailVerified?: boolean;
  usernameHint?: string;
  avatarUrl?: string;
  profile?: Record<string, unknown>;
}

export interface PublicAuthProvider {
  id: string;
  displayName: string;
  icon?: string;
  available: boolean;
  loginEnabled: boolean;
  registrationEnabled: boolean;
}

export interface AuthCompletion {
  userId: number;
  token: string;
  created: boolean;
  returnTo: string;
}
