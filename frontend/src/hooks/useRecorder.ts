"use client";

// Records one spoken answer with MediaRecorder. It shows a live level, stops by itself after a short silence once
// the person has spoken, and releases the microphone as soon as it is done. The audio only lives in memory until
// it is sent to /api/onboarding/answer.

import { useCallback, useEffect, useRef, useState } from "react";
import { sharedAudioContext } from "./useSpeaker";

export type RecorderState = "idle" | "starting" | "recording" | "denied" | "unsupported";
export type Recording = { audio: Blob } | { audio: null; reason: "denied" | "unsupported" | "silent" | "cancelled" };

const TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
const VOICE_LEVEL = 0.035; // RMS above this counts as speech
const SILENCE_MS = 1600; // stop this long after the person stops speaking
const NO_VOICE_MS = 8000; // give up if nothing was said
const MAX_MS = 20000;
const MIN_MANUAL_MS = 700; // when the person presses stop, keep anything at least this long

export function canRecord(): boolean {
  return typeof window !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && "MediaRecorder" in window;
}

function pickType(): string | undefined {
  return TYPES.find((t) => MediaRecorder.isTypeSupported?.(t));
}

export function useRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const discard = useRef(false);
  const stopSoon = useRef(false); // stop pressed while the microphone was still starting
  const manual = useRef(false); // the person pressed stop (so they did say something, even if quietly)
  const timer = useRef<number | null>(null);

  const release = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
  }, []);

  const level = useCallback((): number => {
    const analyser = analyserRef.current;
    const buf = bufRef.current;
    if (!analyser || !buf) return 0;
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const x = (buf[i] - 128) / 128;
      sum += x * x;
    }
    return Math.sqrt(sum / buf.length);
  }, []);

  /** 0..1 for the level meter and the avatar. */
  const getLevel = useCallback(() => Math.min(1, level() * 6), [level]);

  /** Record until the person stops speaking (or presses stop). Resolves with the audio, or why there is none. */
  const record = useCallback(async (): Promise<Recording> => {
    if (!canRecord()) {
      setState("unsupported");
      return { audio: null, reason: "unsupported" };
    }
    if (recorderRef.current) return { audio: null, reason: "cancelled" };
    stopSoon.current = false;
    discard.current = false;
    manual.current = false;
    setState("starting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setState("denied");
      return { audio: null, reason: "denied" };
    }
    if (discard.current) {
      stream.getTracks().forEach((t) => t.stop());
      setState("idle");
      return { audio: null, reason: "cancelled" };
    }
    streamRef.current = stream;
    const ctx = sharedAudioContext();
    if (ctx) {
      try {
        if (ctx.state === "suspended") await ctx.resume();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        analyserRef.current = analyser;
        bufRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      } catch {
        /* record without silence detection */
      }
    }

    const type = pickType();
    const recorder = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
    recorderRef.current = recorder;
    const chunks: Blob[] = [];
    const measuring = Boolean(analyserRef.current);
    // Without a level meter we can't tell if anyone spoke; keep whatever was recorded.
    let heardVoice = !measuring;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    let started = 0;
    const done = new Promise<Recording>((resolve) => {
      recorder.onstop = () => {
        // A quiet voice may stay under the level threshold: trust the person when they press stop.
        if (manual.current && performance.now() - started >= MIN_MANUAL_MS) heardVoice = true;
        release();
        recorderRef.current = null;
        setState("idle");
        if (discard.current) resolve({ audio: null, reason: "cancelled" });
        else if (!heardVoice || chunks.length === 0) resolve({ audio: null, reason: "silent" });
        else resolve({ audio: new Blob(chunks, { type: recorder.mimeType || type || "audio/webm" }) });
      };
    });
    recorder.start(250);
    setState("recording");

    started = performance.now();
    let lastVoice = started;
    timer.current = window.setInterval(() => {
      const now = performance.now();
      if (measuring && level() > VOICE_LEVEL) {
        heardVoice = true;
        lastVoice = now;
      }
      const silentAfterSpeech = heardVoice && now - lastVoice > SILENCE_MS;
      const nothingSaid = measuring && !heardVoice && now - started > NO_VOICE_MS;
      if (silentAfterSpeech || nothingSaid || now - started > MAX_MS) {
        if (recorder.state !== "inactive") recorder.stop();
      }
    }, 100);
    if (stopSoon.current) recorder.stop();
    return done;
  }, [level, release]);

  /** Finish now and keep what was said. */
  const stop = useCallback(() => {
    manual.current = true;
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
    else stopSoon.current = true;
  }, []);

  /** Finish now and throw the audio away. */
  const cancel = useCallback(() => {
    discard.current = true;
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
  }, []);

  useEffect(
    () => () => {
      discard.current = true;
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
      release();
    },
    [release],
  );

  return { record, stop, cancel, state, getLevel };
}
