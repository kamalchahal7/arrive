// Which checklist items and programs apply to this household (kids / seniors or a 65+ user / disability), and which
// items the person has ticked. Everything here runs on the phone from the hardcoded Ottawa data.

import { CHECKLIST, PHASES, type ChecklistItem, type PhaseId } from "@/data/checklist";
import { PROGRAM_GROUPS, PROGRAMS, type Program } from "@/data/programs";
import type { Who } from "@/data/types";
import type { Profile } from "./types";

export type Household = { kids05: boolean; kids617: boolean; seniors: boolean; disability: boolean };

export function householdOf(p: Partial<Profile> | null): Household {
  return {
    kids05: (p?.children_0_5 ?? 0) > 0,
    kids617: (p?.children_6_17 ?? 0) > 0,
    seniors: (p?.seniors ?? 0) > 0 || p?.self_age_group === "senior",
    disability: Boolean(p?.disability_adult || p?.disability_senior || p?.disability_child),
  };
}

export function applies(who: Who, h: Household): boolean {
  switch (who) {
    case "everyone":
      return true;
    case "kids":
      return h.kids05 || h.kids617;
    case "kids_0_5":
      return h.kids05;
    case "kids_6_17":
      return h.kids617;
    case "seniors":
      return h.seniors;
    case "disability":
      return h.disability;
  }
}

export function checklistFor(p: Partial<Profile> | null): { phase: PhaseId; items: ChecklistItem[] }[] {
  const h = householdOf(p);
  return PHASES.map((phase) => ({ phase, items: CHECKLIST.filter((i) => i.phase === phase && applies(i.who, h)) })).filter(
    (g) => g.items.length > 0,
  );
}

/** Programs for this household: everyone first, then seniors, kids, disability. */
export function programsFor(p: Partial<Profile> | null): Program[] {
  const h = householdOf(p);
  return PROGRAM_GROUPS.flatMap((g) => PROGRAMS.filter((x) => x.group === g && applies(x.who, h)));
}

// ---------- ticked items (this phone only) ----------

const DONE_KEY = "arrive.done";

export function doneItems(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

export function setDone(id: string, done: boolean): string[] {
  const next = done ? [...new Set([...doneItems(), id])] : doneItems().filter((x) => x !== id);
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  return next;
}
