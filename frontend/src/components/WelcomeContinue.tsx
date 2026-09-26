"use client";

import { ArrowRight } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Link } from "@/i18n/navigation";
import { getProfileId } from "@/lib/storage";

// One primary action: continue to onboarding, or straight to the roadmap if this device already has a profile.
export function WelcomeContinue({ continueLabel, roadmapLabel }: { continueLabel: string; roadmapLabel: string }) {
  // Read from device storage on the client; the server render assumes no profile.
  const hasProfile = useSyncExternalStore(
    () => () => {},
    () => Boolean(getProfileId()),
    () => false,
  );
  return (
    <Link href={hasProfile ? "/roadmap" : "/onboarding"} className="btn btn-primary min-h-14 w-full text-lg">
      {hasProfile ? roadmapLabel : continueLabel}
      <ArrowRight aria-hidden className="size-6 rtl:-scale-x-100" />
    </Link>
  );
}
