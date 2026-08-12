export type ThemeMode = "light" | "dark" | "system"

export interface User { username?: string; email?: string; avatar_url?: string; is_admin?: boolean }
export interface ChatToolCall { id?: string; name?: string; tool?: string; status?: string; result?: string }
export interface SessionMessage { id: string; role: "user" | "assistant"; content: string; created_at: string; tool_calls?: ChatToolCall[] }
export interface Session {
  id: string; title: string; messages: SessionMessage[]; run_mode?: "chat" | "assistant" | "agent_group";
  model_name?: string; agent_id?: string; skill_ids?: string[]; mcp_server_ids?: string[];
  knowledge_base_ids?: string[]; max_tokens?: number; temperature?: number | null; reasoning_effort?: string;
  auto_compress_context?: boolean; disabled_tool_groups?: string[]; created_at?: string; updated_at?: string
}
export interface Agent { id: string; name: string; prompt?: string; default_model?: string; stream?: boolean; created_at?: string }
export interface KnowledgeBase { id: string; name: string; description?: string; document_count?: number; vectorized?: boolean; updated_at?: string }
export interface StoredFile { id: string; name: string; type?: string; size?: number; created_at?: string }
export interface Device { id: string; name: string; hostname?: string; os?: string; online?: boolean; status?: string; last_seen_at?: string }
