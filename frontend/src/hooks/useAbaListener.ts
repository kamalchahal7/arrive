"use client";

// Tap to speak: opens a silent Aba session (the same ElevenLabs agent and speech-to-text as Ask Aba), waits for one
// spoken answer, and resolves with its text. The session ends as soon as the person has been heard.
// Must be used inside <ConversationProvider> from @elevenlabs/react.

import { useConversation } from "@elevenlabs/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { sessionOptions } from "@/lib/aba";

export type ListenResult = { text: string } | { text: null; reason: "denied" | "silent" | "failed" | "cancelled" };
export type ListenState = "idle" | "connecting" | "listening";

const MAX_MS = 25000; // give up if nothing was heard

export function canListen(): boolean {
  return typeof window !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function useAbaListener(locale: string) {
  const [state, setState] = useState<ListenState>("idle");
  const waiter = useRef<((r: ListenResult) => void) | null>(null);
  const timer = useRef<number | null>(null);

  const finishRef = useRef<(r: ListenResult) => void>(() => {});
  const conversation = useConversation({
    volume: 0,
    onConnect: () => setState("listening"),
    onMessage: ({ message, role }) => {
      // "..." is a turn with no speech in it: keep listening.
      if (role === "user" && message?.replace(/[\s.…。]/g, "")) finishRef.current({ text: message.trim() });
    },
    onError: () => finishRef.current({ text: null, reason: "failed" }),
    onDisconnect: () => finishRef.current({ text: null, reason: "silent" }),
  });
  const conv = useRef(conversation);
  useEffect(() => {
    conv.current = conversation;
  });

  const finish = useCallback((result: ListenResult) => {
    const resolve = waiter.current;
    if (!resolve) return;
    waiter.current = null;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    try {
      conv.current.endSession();
    } catch {
      /* already closed */
    }
    setState("idle");
    resolve(result);
  }, []);

  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  /** Listen for one answer. */
  const listen = useCallback(async (): Promise<ListenResult> => {
    if (waiter.current) return { text: null, reason: "cancelled" };
    try {
      // Ask for the microphone first, so a refusal is clear (and the permission is kept for the session).
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      return { text: null, reason: "denied" };
    }
    setState("connecting");
    const done = new Promise<ListenResult>((resolve) => {
      waiter.current = resolve;
    });
    timer.current = window.setTimeout(() => finish({ text: null, reason: "silent" }), MAX_MS);
    try {
      const options = await sessionOptions("listen", locale);
      if (waiter.current) conv.current.startSession(options);
    } catch {
      finish({ text: null, reason: "failed" });
    }
    return done;
  }, [finish, locale]);

  const cancel = useCallback(() => finish({ text: null, reason: "cancelled" }), [finish]);

  const getLevel = useCallback((): number => {
    try {
      return Math.min(1, conv.current.getInputVolume() * 2);
    } catch {
      return 0;
    }
  }, []);

  useEffect(() => () => finish({ text: null, reason: "cancelled" }), [finish]);

  return { listen, cancel, state, getLevel };
}
