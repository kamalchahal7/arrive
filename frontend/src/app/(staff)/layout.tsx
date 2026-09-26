import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Fraunces } from "next/font/google";
import "../globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const atkinson = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-atkinson", display: "swap" });

export const metadata: Metadata = { title: { default: "Arrive for staff", template: "%s · Arrive for staff" }, robots: { index: false } };

// Staff tools (settlement workers, government analysts) are in English for the MVP.
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={`${fraunces.variable} ${atkinson.variable}`}>
      <body className="min-h-dvh bg-ground text-ink antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
