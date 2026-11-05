import type { PluginMcpServer, PluginSkill } from "./manifest.js";

export interface Marketplace {
  id: string;
  url: string;
  name: string;
  revision: string;
  syncedAt: string;
  error: string;
  pluginCount: number;
}

export interface ExternalPlugin {
  id: string;
  marketplaceId: string;
  slug: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage: string;
  license: string;
  manifestPath: string;
  skills: PluginSkill[];
  /** `hasToken` says whether this user has stored a credential; it is never returned. */
  mcpServers: Array<PluginMcpServer & { hasToken: boolean }>;
  ignored: string[];
  unsupported: string[];
  category: string;
  /** Set when the plugin lives in another repository and has to be fetched. */
  source: { url: string; path?: string; ref?: string } | null;
  /** Whether its skills and servers have been read; false until installed. */
  materialized: boolean;
  /** Installed into this user's chats; a plugin that is merely available is not. */
  installed: boolean;
}

export interface ExternalPluginService {
  marketplaces(userId: number): Promise<Marketplace[]>;
  addMarketplace(userId: number, url: string): Promise<Marketplace>;
  syncMarketplace(userId: number, id: string): Promise<Marketplace>;
  removeMarketplace(userId: number, id: string): Promise<boolean>;
  plugins(userId: number): Promise<ExternalPlugin[]>;
  setInstalled(userId: number, id: string, installed: boolean): Promise<boolean>;
  setToken(userId: number, pluginId: string, serverId: string, token: string): Promise<void>;
  /** Connects with whatever credential is stored, so the answer is the truth. */
  testServer(userId: number, serverId: string): Promise<{ ok: boolean; tools: string[]; error: string }>;
}

declare module "yumeri" {
  interface Components {
    "external-plugin": ExternalPluginService;
  }
  interface Tables {
    external_plugin_marketplaces: {
      id: string;
      user_id: number;
      url: string;
      name: string;
      directory: string;
      revision: string;
      synced_at: string;
      error_text: string;
      created_at: string;
      updated_at: string;
    };
    external_plugins: {
      id: string;
      user_id: number;
      marketplace_id: string;
      slug: string;
      name: string;
      version: string;
      description: string;
      author: string;
      homepage: string;
      license: string;
      category: string;
      source: string;
      materialized: number;
      manifest_path: string;
      skills: string;
      mcp_servers: string;
      ignored: string;
      unsupported: string;
      enabled: number;
      created_at: string;
      updated_at: string;
    };
    external_plugin_credentials: {
      id: string;
      user_id: number;
      server_id: string;
      plugin_id: string;
      token: string;
      created_at: string;
      updated_at: string;
    };
  }
}
