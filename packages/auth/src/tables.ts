// Tables owned by the authentication plugin.
//
// Login session persistence belongs to @velocelab/user so it works both with
// auth enabled and with the built-in default user mode.
import type { Database } from "yumeri";
import type { AuthIdentity, AuthTransaction } from "./types.js";

declare module "@yumerijs/types" {
  interface Tables {
    auth_identities: AuthIdentity;
    auth_transactions: AuthTransaction;
  }
}

export async function ensureTables(db: Database): Promise<void> {
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
