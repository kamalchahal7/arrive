// Anonymized usage events (docs/REDESIGN.md section 9). Fire and forget: analytics never slows or breaks the app.
// The backend stores only fixed categories and a salted hash of the profile, never the ID or any text.

import { getProfileId } from "./storage";

export type EventName =
  | "view_item"
  | "view_program"
  | "program_interest"
  | "item_done"
  | "assistant_question"
  | "staff_card_opened"
  | "language_changed";

const SESSION_KEY = "arrive.session";
const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

/** A random ID for this visit (this tab), so events from one session can be counted together. */
export function sessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, "");
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "nostorage00";
  }
}

export function track(event: EventName, language: string, targetId?: string): void {
  try {
    void fetch(`${BASE}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        session_id: sessionId(),
        event,
        language,
        target_id: targetId ?? null,
        profile_id: getProfileId() || null,
      }),
    }).catch(() => {});
  } catch {
    /* never mind */
  }
}
