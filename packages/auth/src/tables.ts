// Tables owned by this plugin.
//
// `extend` is idempotent: it creates the table when it is missing and adds the
// columns that are absent, so an existing database is migrated in place.
import type { Database } from "yumeri";
import type { AuthIdentity, AuthTransaction } from "./types.js";

/** A revoked session token, stored as its hash rather than the credential itself. */
export interface RevokedToken {
  id: string;
  user_id: number;
  expires_at: string;
  created_at: string;
}

declare module "@yumerijs/types" {
  interface Tables {
    auth_revoked_tokens: RevokedToken;
    auth_identities: AuthIdentity;
    auth_transactions: AuthTransaction;
  }
}

export async function ensureTables(db: Database): Promise<void> {
  await db.extend("auth_revoked_tokens", {
    id: { type: "string", nullable: false },
    user_id: { type: "integer", initial: 0 },
    expires_at: { type: "string", nullable: false },
    created_at: "timestamp",
  });
  // A separate table is required because one local user may bind several
  // providers, and a provider subject must never be shared by two accounts.
  await db.extend("auth_identities", {
    id: { type: "integer", autoIncrement: true },
    user_id: { type: "integer", nullable: false },
    provider: { type: "string", nullable: false },
    subject: { type: "string", nullable: false },
    email_at_link_time: "string",
    profile_json: "text",
    created_at: "timestamp",
    updated_at: "timestamp",
  }, { unique: [["provider", "subject"]] });
  // Transactions are intentionally provider-neutral. They give provider
  // plugins a durable place for state/nonce/PKCE metadata without exposing it
  // in a browser cookie or letting callback routes trust arbitrary return URLs.
  await db.extend("auth_transactions", {
    id: { type: "string", nullable: false },
    type: { type: "string", nullable: false },
    provider: { type: "string", nullable: false },
    user_id: "integer",
    return_to: "string",
    verifier_hash: "string",
    nonce: "string",
    expires_at: { type: "string", nullable: false },
    consumed_at: "timestamp",
    created_at: "timestamp",
  }, { unique: ["id"] });
}
