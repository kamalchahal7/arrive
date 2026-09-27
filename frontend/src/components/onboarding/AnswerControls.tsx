"use client";

// Tap and type answers for onboarding. Every question has one of these on screen at all times, so voice is never
// the only way to answer (docs/REDESIGN.md 4.2). Big targets (at least 56px), icons, and pressed states.

import { Check, Minus, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type ReactNode, useId } from "react";

export type Choice = { id: string; label: ReactNode; icon?: LucideIcon; lang?: string };

export function ChoiceCards({
  choices,
  value,
  onChoose,
  columns = 1,
}: {
  choices: Choice[];
  value: string | null;
  onChoose: (id: string) => void;
  columns?: 1 | 2;
}) {
  return (
    <ul className={`grid gap-3 ${columns === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
      {choices.map(({ id, label, icon: Icon, lang }) => {
        const selected = value === id;
        return (
          <li key={id}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onChoose(id)}
              className={`flex min-h-16 w-full items-center gap-3 rounded-card border-2 px-4 py-3 text-start text-lg font-bold ${
                selected ? "border-brand bg-brand-light text-brand" : "border-line bg-surface hover:border-brand"
              }`}
            >
              {Icon && (
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-light text-brand">
                  <Icon aria-hidden className="size-6" />
                </span>
              )}
              <span className="flex-1" lang={lang}>
                {label}
              </span>
              {selected && <Check aria-hidden className="size-6 shrink-0" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Chips({
  choices,
  values,
  onToggle,
}: {
  choices: Choice[];
  values: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <ul className="flex flex-wrap gap-2">
      {choices.map(({ id, label, icon: Icon, lang }) => {
        const selected = values.includes(id);
        return (
          <li key={id}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onToggle(id)}
              className={`flex min-h-14 items-center gap-2 rounded-full border-2 px-4 py-2 text-lg font-bold ${
                selected ? "border-brand bg-brand text-white" : "border-line bg-surface hover:border-brand"
              }`}
            >
              {selected ? <Check aria-hidden className="size-5" /> : Icon ? <Icon aria-hidden className="size-5" /> : null}
              <span lang={lang}>{label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Stepper({
  label,
  value,
  onChange,
  fewerLabel,
  moreLabel,
  icon: Icon,
  max = 20,
}: {
  label: ReactNode;
  value: number;
  onChange: (n: number) => void;
  fewerLabel: string;
  moreLabel: string;
  icon?: LucideIcon;
  max?: number;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3 rounded-card border-2 border-line bg-surface p-3">
      <span id={id} className="flex items-center gap-3 text-lg font-bold">
        {Icon && (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-light text-brand">
            <Icon aria-hidden className="size-6" />
          </span>
        )}
        {label}
      </span>
      <span className="flex items-center gap-2" role="group" aria-labelledby={id}>
        <button
          type="button"
          className="flex size-14 items-center justify-center rounded-full border-2 border-brand text-brand disabled:border-line disabled:text-muted"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value <= 0}
          aria-label={fewerLabel}
        >
          <Minus aria-hidden className="size-6" />
        </button>
        <output aria-live="polite" aria-labelledby={id} className="w-10 text-center text-2xl font-bold tabular-nums">
          {value}
        </output>
        <button
          type="button"
          className="flex size-14 items-center justify-center rounded-full bg-brand text-white disabled:bg-line"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={moreLabel}
        >
          <Plus aria-hidden className="size-6" />
        </button>
      </span>
    </div>
  );
}

export function TextAnswer({
  label,
  hint,
  value,
  onChange,
  onSubmit,
  autoComplete,
  maxLength,
}: {
  label: ReactNode;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  autoComplete?: string;
  maxLength: number;
}) {
  const id = useId();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor={id} className="label text-lg">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-muted">
          {hint}
        </p>
      )}
      <input
        id={id}
        className="field min-h-14 text-xl"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        maxLength={maxLength}
        aria-describedby={hint ? `${id}-hint` : undefined}
        dir="auto"
      />
    </form>
  );
}
