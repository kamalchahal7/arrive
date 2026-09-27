"use client";

// Reads text aloud with the backend's /api/tts (ElevenLabs) and exposes the audio level, so the avatar's mouth can
// follow the voice (Web Audio AnalyserNode). Audio for the same text is fetched once per page session.

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";

export type SpeakerState = "idle" | "loading" | "speaking";

const audioUrls = new Map<string, Promise<string>>();
let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      context = new Ctor();
    } catch {
      return null;
    }
  }
  return context;
}

/** Call from a tap or click handler: browsers only start audio after a user gesture. */
export function unlockAudio(): void {
  const ctx = audioContext();
  if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
}

export function sharedAudioContext(): AudioContext | null {
  return audioContext();
}

function speechUrl(text: string, language: string): Promise<string> {
  const key = `${language}|${text}`;
  let url = audioUrls.get(key);
  if (!url) {
    url = api<Blob>("/tts", { method: "POST", body: { text: text.slice(0, 1500), language } }).then((blob) =>
      URL.createObjectURL(blob),
    );
    url.catch(() => audioUrls.delete(key));
    audioUrls.set(key, url);
  }
  return url;
}

/** Fetch audio ahead of time (for example the next question) so it starts without a wait. */
export function prefetchSpeech(text: string, language: string): void {
  speechUrl(text, language).catch(() => {});
}

function rms(analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = (buf[i] - 128) / 128;
    sum += x * x;
  }
  return Math.sqrt(sum / buf.length);
}

export function useSpeaker(language: string, enabled: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const playing = useRef(false);
  const run = useRef(0);
  const [state, setState] = useState<SpeakerState>("idle");
  // Once read-aloud fails (not configured, language not spoken), stay in text mode for this visit.
  const [failed, setFailed] = useState(false);

  const element = useCallback(async (): Promise<HTMLAudioElement> => {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;
    const ctx = audioContext();
    if (ctx) {
      // Only route through Web Audio when the context is running: a suspended context would play silence.
      if (ctx.state !== "running") {
        await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 300))]);
      }
      if (ctx.state === "running") {
        try {
          const source = ctx.createMediaElementSource(audio);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          source.connect(analyser);
          analyser.connect(ctx.destination);
          analyserRef.current = analyser;
          bufRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        } catch {
          /* play without the level meter */
        }
      }
    }
    return audio;
  }, []);

  const stop = useCallback(() => {
    run.current++;
    audioRef.current?.pause();
    playing.current = false;
    setState("idle");
  }, []);

  /** Speak and resolve when finished. Resolves false if stopped, unavailable or failed. */
  const speak = useCallback(
    async (text: string): Promise<boolean> => {
      if (!enabled || failed || !text.trim()) return false;
      const mine = ++run.current;
      audioRef.current?.pause();
      setState("loading");
      try {
        const url = await speechUrl(text, language);
        if (mine !== run.current) return false;
        const audio = await element();
        audio.src = url;
        const ended = new Promise<void>((resolve) => {
          audio.onended = () => resolve();
          audio.onpause = () => resolve();
          audio.onerror = () => resolve();
        });
        await audio.play();
        playing.current = true;
        setState("speaking");
        await ended;
        playing.current = false;
        if (mine !== run.current) return false;
        setState("idle");
        return true;
      } catch (err) {
        playing.current = false;
        if (mine === run.current) setState("idle");
        const name = (err as Error)?.name;
        // Autoplay blocked or interrupted is not a read-aloud failure; the person can press "Repeat".
        if (err instanceof ApiError || (name !== "NotAllowedError" && name !== "AbortError")) setFailed(true);
        return false;
      }
    },
    [element, enabled, failed, language],
  );

  /** 0..1, how loud the voice is right now (a gentle wave if the level can't be measured). */
  const getLevel = useCallback((): number => {
    if (!playing.current) return 0;
    const analyser = analyserRef.current;
    const buf = bufRef.current;
    if (!analyser || !buf) return 0.35 + 0.25 * Math.sin(performance.now() / 70);
    return Math.min(1, rms(analyser, buf) * 5);
  }, []);

  useEffect(
    () => () => {
      run.current++;
      audioRef.current?.pause();
    },
    [],
  );

  return { speak, stop, state, available: enabled && !failed, failed, getLevel };
}
