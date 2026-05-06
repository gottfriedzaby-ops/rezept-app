export type ShareStatus = "pending" | "accepted" | "declined" | "left" | "revoked";
export type ReshareRequestStatus =
  | "pending_owner_consent"
  | "approved"
  | "rejected"
  | "cancelled";

export interface LibraryShare {
  id: string;
  created_at: string;
  updated_at: string;
  owner_id: string;
  recipient_id: string | null;
  recipient_email: string;
  status: ShareStatus;
  invitation_token: string | null;
  invited_at: string;
  accepted_at: string | null;
  declined_at: string | null;
  revoked_at: string | null;
}

export interface LibraryShareOutbound extends LibraryShare {
  recipient_display_name: string | null;
}

export interface LibraryShareInbound extends LibraryShare {
  owner_display_name: string | null;
  owner_email: string;
}

export interface ReshareRequest {
  id: string;
  created_at: string;
  parent_share_id: string;
  requested_by_id: string;
  target_email: string;
  status: ReshareRequestStatus;
  resolved_at: string | null;
  resulting_share_id: string | null;
}

export interface UserSettings {
  user_id: string;
  merge_shared_tags_into_global: boolean;
  created_at: string;
  updated_at: string;
}
