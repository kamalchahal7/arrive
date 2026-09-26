"use server";

import { revalidatePath } from "next/cache";
import { staffApi } from "@/lib/server-api";

export async function updateHandoff(id: string, patch: { status?: "new" | "in_progress" | "resolved"; assign_to_me?: boolean }) {
  // The backend re-checks the settlement_worker role on every call.
  await staffApi(`/worker/handoffs/${encodeURIComponent(id)}`, { method: "PATCH", body: patch });
  revalidatePath("/worker");
}
