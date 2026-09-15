// Tables owned by this plugin.
//
// `extend` is idempotent: it creates the table when it is missing and adds the
// columns that are absent, so an existing database is migrated in place.
import type { Database } from "yumeri";

/**
 * A token that has been logged out.
 *
 * The row is keyed by the token's hash rather than the token itself: the
 * revocation list is a credential store, and a database dump must not hand
 * anyone a working session. `expires_at` is the token's own expiry, so the list
 * only ever holds tokens that could still be presented.
 */
export interface RevokedToken {
  id: string;
  user_id: number;
  expires_at: string;
  created_at: string;
}

declare module "@yumerijs/types" {
  interface Tables {
    auth_revoked_tokens: RevokedToken;
  }
}

export async function ensureTables(db: Database): Promise<void> {
  await db.extend("auth_revoked_tokens", {
    id: { type: "string", nullable: false },
    user_id: { type: "integer", initial: 0 },
    expires_at: { type: "string", nullable: false },
    created_at: "timestamp",
  });
}
