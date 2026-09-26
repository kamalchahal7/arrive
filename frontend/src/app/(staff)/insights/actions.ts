"use server";

import { staffApi } from "@/lib/server-api";

export async function generateBrief(): Promise<{ markdown: string; has_sample_data: boolean; generated_at: string }> {
  // Gemini writes the brief from aggregated, suppressed numbers only (see backend services/insights.py).
  return staffApi("/insights/brief", { method: "POST" });
}
