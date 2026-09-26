"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { type A11ySettings, DEFAULT_SETTINGS, getSettings, saveSettings } from "@/lib/storage";

type Ctx = { settings: A11ySettings; update: (patch: Partial<A11ySettings>) => void; reset: () => void };

const SettingsContext = createContext<Ctx>({ settings: DEFAULT_SETTINGS, update: () => {}, reset: () => {} });

function apply(s: A11ySettings): void {
  const d = document.documentElement.dataset;
  d.textSize = String(s.textSize);
  if (s.highContrast) d.contrast = "high";
  else delete d.contrast;
  if (s.simpleMode) d.simple = "true";
  else delete d.simple;
  if (s.reduceMotion) d.reduceMotion = "true";
  else delete d.reduceMotion;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<A11ySettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const stored = getSettings();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- settings live in localStorage, only readable after hydration
    setSettings(stored);
    apply(stored);
  }, []);

  const update = useCallback((patch: Partial<A11ySettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      apply(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    saveSettings(DEFAULT_SETTINGS);
    apply(DEFAULT_SETTINGS);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return <SettingsContext.Provider value={{ settings, update, reset }}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
