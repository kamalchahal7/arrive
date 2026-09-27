"use client";

import QRCode from "qrcode";
import { useMemo } from "react";

/** A QR code drawn as SVG squares (no image files, no network). Dark on white with a quiet zone, so phones scan it. */
export function QrCode({ value, label, size = 240 }: { value: string; label: string; size?: number }) {
  const path = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    const cells: string[] = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.modules.get(x, y)) cells.push(`M${x + 4} ${y + 4}h1v1h-1z`);
      }
    }
    return { d: cells.join(""), box: n + 8 };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${path.box} ${path.box}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="rounded-lg bg-white"
    >
      <rect width={path.box} height={path.box} fill="#ffffff" />
      <path d={path.d} fill="#000000" />
    </svg>
  );
}
