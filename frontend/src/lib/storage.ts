// Small, safe wrappers around localStorage. Storage can be unavailable (private mode, blocked), so every
// access is guarded and the app keeps working without it.

const PROFILE_KEY = "arrive.profileId";
const SETTINGS_KEY = "arrive.settings";
const ROADMAP_KEY = "arrive.roadmapCache";
const PROFILE_CACHE_KEY = "arrive.profile";
const DRAFT_KEY = "arrive.onboardingDraft";

export type A11ySettings = {
  textSize: 1 | 2 | 3 | 4;
  highContrast: boolean;
  simpleMode: boolean;
  autoRead: boolean;
  reduceMotion: boolean;
  /** Voice onboarding: start listening by itself after each question is read. */
  autoListen: boolean;
};

export const DEFAULT_SETTINGS: A11ySettings = {
  textSize: 1,
  highContrast: false,
  simpleMode: false,
  autoRead: false,
  reduceMotion: false,
  autoListen: false,
};

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export const getProfileId = (): string | null => read(PROFILE_KEY);
export const setProfileId = (id: string | null): void => write(PROFILE_KEY, id);

export function getSettings(): A11ySettings {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(read(SETTINGS_KEY) || "{}") as Partial<A11ySettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
export const saveSettings = (s: A11ySettings): void => write(SETTINGS_KEY, JSON.stringify(s));

// The last roadmap is kept on the device so it can be shown on a bad connection.
export function getCachedRoadmap<T>(lang: string): T | null {
  try {
    const data = JSON.parse(read(ROADMAP_KEY) || "null") as { lang: string; roadmap: T } | null;
    return data && data.lang === lang ? data.roadmap : null;
  } catch {
    return null;
  }
}
export const cacheRoadmap = (lang: string, roadmap: unknown): void =>
  write(ROADMAP_KEY, JSON.stringify({ lang, roadmap }));

// The last profile, kept on the device so the home screen and ID card work on a bad connection.
// It holds the first name, which stays on this phone.
export function getCachedProfile<T>(): T | null {
  try {
    return JSON.parse(read(PROFILE_CACHE_KEY) || "null") as T | null;
  } catch {
    return null;
  }
}
export const cacheProfile = (profile: unknown): void => write(PROFILE_CACHE_KEY, JSON.stringify(profile));

// Onboarding answers so far, for this tab only (sessionStorage), so a reload does not lose them.
export function getDraft<T>(): T | null {
  try {
    return JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) || "null") as T | null;
  } catch {
    return null;
  }
}
export function saveDraft(draft: unknown): void {
  try {
    if (draft === null) window.sessionStorage.removeItem(DRAFT_KEY);
    else window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* storage unavailable */
  }
}

export function clearAll(): void {
  for (const key of [PROFILE_KEY, SETTINGS_KEY, ROADMAP_KEY, PROFILE_CACHE_KEY]) write(key, null);
  saveDraft(null);
}

// Runs before React hydrates (inlined in the layout) so settings apply without a flash.
export const SETTINGS_BOOT_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem("${SETTINGS_KEY}")||"{}");var d=document.documentElement;if(s.textSize)d.dataset.textSize=String(s.textSize);if(s.highContrast)d.dataset.contrast="high";if(s.simpleMode)d.dataset.simple="true";if(s.reduceMotion)d.dataset.reduceMotion="true";}catch(e){}})();`;
