"use client";

import { CheckCircle2, Mail, MessageSquare, Phone, RotateCcw, UserCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { updateHandoff } from "@/app/(staff)/worker/actions";

export function HandoffActions({
  id,
  status,
  contactMethod,
  contactValue,
}: {
  id: string;
  status: "new" | "in_progress" | "resolved";
  contactMethod: string;
  contactValue: string | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const digits = (contactValue || "").replace(/[^\d+]/g, "");

  const run = (patch: Parameters<typeof updateHandoff>[1]) =>
    start(async () => {
      setError(null);
      try {
        await updateHandoff(id, patch);
      } catch {
        setError("Could not update this request. Try again.");
      }
    });

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <div className="flex flex-wrap gap-2">
        {contactValue && (contactMethod === "phone" || contactMethod === "text" || contactMethod === "whatsapp") && (
          <a href={`tel:${digits}`} className="btn btn-primary">
            <Phone aria-hidden className="size-5" />
            Call back
          </a>
        )}
        {contactValue && (contactMethod === "text" || contactMethod === "whatsapp") && (
          <a
            href={contactMethod === "whatsapp" ? `https://wa.me/${digits.replace("+", "")}` : `sms:${digits}`}
            className="btn btn-secondary"
            target={contactMethod === "whatsapp" ? "_blank" : undefined}
            rel="noopener noreferrer"
          >
            <MessageSquare aria-hidden className="size-5" />
            Message
          </a>
        )}
        {contactValue && contactMethod === "email" && (
          <a href={`mailto:${contactValue}`} className="btn btn-primary">
            <Mail aria-hidden className="size-5" />
            Email
          </a>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {status === "new" && (
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => run({ status: "in_progress", assign_to_me: true })}>
            <UserCheck aria-hidden className="size-5" />
            Take this request
          </button>
        )}
        {status !== "resolved" ? (
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => run({ status: "resolved" })}>
            <CheckCircle2 aria-hidden className="size-5" />
            Mark resolved
          </button>
        ) : (
          <button type="button" className="btn btn-quiet" disabled={pending} onClick={() => run({ status: "in_progress" })}>
            <RotateCcw aria-hidden className="size-5" />
            Reopen
          </button>
        )}
      </div>
      <p aria-live="polite" className="text-sm text-muted">
        {pending ? "Saving…" : error}
      </p>
    </div>
  );
}
