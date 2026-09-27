"use client";

import { ExternalLink, Map as MapIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";
import type { Place } from "@/lib/types";

// Map for an office (docs/REDESIGN.md 7.1): a plain Google Maps search link (no key needed) and an embedded map.
// OpenStreetMap by default; the Google Maps Embed API only when GOOGLE_MAPS_EMBED_KEY is set on the server.
// On a data-saver connection the map waits for a tap.

export function mapQuery(place: Place): string {
  return place.address ? `${place.name}, ${place.address}` : place.map_query || place.name;
}

export function googleMapsUrl(place: Place): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery(place))}`;
}

function embedUrl(place: Place, googleKey: string | null): string | null {
  if (googleKey) {
    return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(googleKey)}&q=${encodeURIComponent(mapQuery(place))}`;
  }
  if (place.lat == null || place.lon == null) return null;
  const { lat, lon } = place;
  const bbox = [lon - 0.006, lat - 0.0035, lon + 0.006, lat + 0.0035].map((n) => n.toFixed(6)).join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
}

const saveData = () =>
  Boolean((navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection?.saveData) ||
  ["slow-2g", "2g"].includes((navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType ?? "");

export function PlaceMap({ place, googleKey }: { place: Place; googleKey: string | null }) {
  const t = useTranslations("Item");
  const lowData = useSyncExternalStore(() => () => {}, saveData, () => false);
  const [asked, setAsked] = useState(false);
  const src = embedUrl(place, googleKey);
  const show = src && (!lowData || asked);

  return (
    <div className="flex flex-col gap-2">
      {src && show && (
        <iframe
          title={t("mapTitle", { place: place.name })}
          src={src}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="aspect-[4/3] w-full rounded-card border border-line bg-surface"
        />
      )}
      {src && !show && (
        <button type="button" className="btn btn-secondary" onClick={() => setAsked(true)}>
          <MapIcon aria-hidden className="size-5" />
          {t("showMap")}
        </button>
      )}
      {src && show && !googleKey && (
        <p className="text-sm text-muted" lang="en" dir="ltr">
          Map ©{" "}
          <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
            OpenStreetMap contributors
          </a>
        </p>
      )}
      <a href={googleMapsUrl(place)} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
        <ExternalLink aria-hidden className="size-5" />
        {t("openMaps")}
        <span className="sr-only">{t("opensNewTab")}</span>
      </a>
    </div>
  );
}
