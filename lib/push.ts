import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabase";

// Server-side Web Push sender. Configuration is lazy and optional: if the VAPID
// env vars are not set, sending is a no-op so the app works without push set up.
// See docs/requirements/push-notifications-golive.md for the setup steps.

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || "mailto:noreply@rezept-app.app";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Sends a push to every subscription of a user. Best-effort: never throws, so
// callers can invoke it after a DB write without risking the request. Expired
// subscriptions (HTTP 404/410 from the push service) are pruned.
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  try {
    if (!ensureConfigured()) return;

    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);

    if (!subs || subs.length === 0) return;

    const body = JSON.stringify(payload);
    await Promise.all(
      (subs as SubRow[]).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id);
          } else {
            console.error("[push] send failed:", statusCode ?? err);
          }
        }
      }),
    );
  } catch (err) {
    console.error("[push] sendPushToUser error:", err);
  }
}
