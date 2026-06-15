import type { FastingPresetId } from "@/lib/fasting";

export type { FastingPresetId };

export interface FastingSession {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  /** ISO timestamp */
  started_at: string;
  /** ISO timestamp, or null while the fast is running */
  ended_at: string | null;
  target_hours: number;
  preset: FastingPresetId;
}

/** Response shape of GET /api/nutrition/fasting. */
export interface FastingState {
  active: FastingSession | null;
  history: FastingSession[];
}
