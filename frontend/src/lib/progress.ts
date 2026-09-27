// Checklist completion (docs/REDESIGN.md 5.3): saved to the backend (checklist_progress) and on the phone, so a tick
// made offline is kept and sent when the connection comes back.

import { api, ApiError } from "./api";
import type { Checklist } from "./types";

const CHECKLIST_KEY = "arrive.checklist";
const QUEUE_KEY = "arrive.pendingProgress";

export type Change = { item_id: string; person_key: string; status: "todo" | "done" };

function read<T>(key: string): T | null {
  try {
    return JSON.parse(window.localStorage.getItem(key) || "null") as T | null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export function cachedChecklist(lang: string): Checklist | null {
  const saved = read<{ lang: string; checklist: Checklist }>(CHECKLIST_KEY);
  return saved && saved.lang === lang ? applyPending(saved.checklist) : null;
}

export function cacheChecklist(lang: string, checklist: Checklist): void {
  write(CHECKLIST_KEY, { lang, checklist });
}

export function pending(): Change[] {
  return read<Change[]>(QUEUE_KEY) ?? [];
}

function queue(change: Change): void {
  const rest = pending().filter((c) => !(c.item_id === change.item_id && c.person_key === change.person_key));
  write(QUEUE_KEY, [...rest, change]);
}

/** A checklist with one row's status changed, and every count recomputed. */
export function withStatus(c: Checklist, change: Change): Checklist {
  const phases = c.phases.map((phase) => {
    const items = phase.items.map((row) =>
      row.item_id === change.item_id && row.person_key === change.person_key
        ? { ...row, status: change.status, completed_at: change.status === "done" ? new Date().toISOString() : null }
        : row,
    );
    return { ...phase, items, done: items.filter((r) => r.status === "done").length };
  });
  return { ...c, phases, done: phases.reduce((n, p) => n + p.done, 0) };
}

export function applyPending(c: Checklist): Checklist {
  return pending().reduce(withStatus, c);
}

/** Send queued ticks. Resolves true when nothing is left to send. */
export async function flush(profileId: string): Promise<boolean> {
  const items = pending();
  if (!items.length) return true;
  try {
    await api(`/checklist/${profileId}/items`, { method: "PATCH", body: { items } });
  } catch (err) {
    // A row that no longer exists (the household changed) will never be accepted: drop the queue.
    if (err instanceof ApiError && (err.code === "unknown_checklist_item" || err.code === "profile_not_found")) {
      write(QUEUE_KEY, null);
      return true;
    }
    return false;
  }
  // Keep anything ticked while the request was on its way.
  const sent = new Set(items.map((c) => `${c.item_id}|${c.person_key}|${c.status}`));
  write(QUEUE_KEY, pending().filter((c) => !sent.has(`${c.item_id}|${c.person_key}|${c.status}`)));
  return true;
}

/** Record a tick locally and try to send it. Resolves true if the server has it. */
export async function saveChange(profileId: string, change: Change): Promise<boolean> {
  queue(change);
  return flush(profileId);
}

export function clearProgressCache(): void {
  write(CHECKLIST_KEY, null);
  write(QUEUE_KEY, null);
}
