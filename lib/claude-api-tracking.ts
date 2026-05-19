import { supabaseAdmin } from "@/lib/supabase";

// Row shape that maps 1:1 to the claude_api_calls table. See
// supabase/migrations/20260519000000_feature13_admin_foundation.sql.
export interface ClaudeApiCallRow {
  user_id: string | null;
  function: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number | null;
  cache_creation_tokens: number | null;
  duration_ms: number;
  status: "success" | "error";
  error_message: string | null;
}

// Fire-and-forget insert. Callers MUST NOT await this — the contract is that a
// failed write never breaks an import. Errors are logged and swallowed.
export function logClaudeCall(row: ClaudeApiCallRow): void {
  void (async () => {
    try {
      const { error } = await supabaseAdmin
        .from("claude_api_calls")
        .insert(row);
      if (error) {
        console.error("[claude-api-tracking] insert failed:", error);
      }
    } catch (err) {
      console.error("[claude-api-tracking] insert threw:", err);
    }
  })();
}

// Truncate a long error message to keep the column small without losing the
// first useful slice. Database has no length constraint, but logs and the
// admin UI render better with a sensible cap.
export function truncateError(message: string, max = 500): string {
  if (message.length <= max) return message;
  return message.slice(0, max - 1) + "…";
}
