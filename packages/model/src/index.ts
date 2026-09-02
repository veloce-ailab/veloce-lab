import { Context, Database } from "yumeri";

export interface User {
  id?: number;
  username: string;
  email: string;
  password_hash: string;
  is_admin: boolean;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface ModelService {
  users: {
    findByIdentifier(identifier: string): Promise<User | undefined>;
    findAdmin(): Promise<User | undefined>;
    create(user: Omit<User, "id" | "created_at" | "updated_at">): Promise<User>;
  };
}

declare module "yumeri" {
  interface Tables {
    users: User;
  }
  interface Components {
    model: ModelService;
  }
}

export const depend = ["velocelab-core", "config", "database"];
export const provide = ["model"];

export async function apply(ctx: Context) {
  const db = ctx.component.database as Database;
  await db.extend(
    "users",
    {
      id: { type: "integer", autoIncrement: true },
      username: { type: "string", nullable: false },
      email: { type: "string", nullable: false },
      password_hash: { type: "string", nullable: false },
      is_admin: { type: "boolean", nullable: false },
      email_verified: { type: "boolean", nullable: false },
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: ["username"] },
  );

  const users = {
    findByIdentifier: (identifier: string) =>
      db.selectOne("users", {
        $or: [{ username: identifier }, { email: identifier.toLowerCase() }],
      } as any),
    findAdmin: () => db.selectOne("users", { is_admin: true } as any),
    async create(data: Omit<User, "id" | "created_at" | "updated_at">) {
      const now = new Date().toISOString();
      return db.create("users", { ...data, created_at: now, updated_at: now });
    },
  };
  ctx.registerComponent("model", { users });
}
