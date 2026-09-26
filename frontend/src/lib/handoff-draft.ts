// Passes the person's question to the "Talk to a person" form without putting it in the URL
// (URLs end up in server and proxy logs). Kept only for this browser tab.

const KEY = "arrive.handoffDraft";

export type HandoffDraft = { need: string; topic?: string; requestId?: string | null };

export function saveDraft(draft: HandoffDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    /* storage unavailable */
  }
}

export function takeDraft(): HandoffDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return raw ? (JSON.parse(raw) as HandoffDraft) : null;
  } catch {
    return null;
  }
}
