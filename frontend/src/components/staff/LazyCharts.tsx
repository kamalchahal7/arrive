"use client";

import dynamic from "next/dynamic";

// Charts load after the page so the numbers and tables show first on slow connections.
const box = (h: number) =>
  function ChartPlaceholder() {
    return <div className="animate-pulse rounded-xl bg-line/50" style={{ height: h }} aria-hidden />;
  };

export const TopTopicsChart = dynamic(() => import("./InsightsCharts").then((m) => m.TopTopicsChart), { ssr: false, loading: box(300) });
export const OverTimeChart = dynamic(() => import("./InsightsCharts").then((m) => m.OverTimeChart), { ssr: false, loading: box(260) });
export const LanguagesChart = dynamic(() => import("./InsightsCharts").then((m) => m.LanguagesChart), { ssr: false, loading: box(220) });
