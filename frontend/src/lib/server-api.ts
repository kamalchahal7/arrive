import "server-only";
import { auth0 } from "./auth0";

// Server-side calls to the backend for staff pages. The access token stays on the server; the browser
// never sees it. Inside Docker the backend is reached on the internal network.
const BASE = process.env.API_INTERNAL_URL || "http://localhost:8000/api";

export class StaffApiError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}

export async function staffApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { token } = await auth0.getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    method: init.method || "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    let code = "internal_error";
    try {
      code = ((await res.json()) as { error?: string }).error || code;
    } catch {
      /* not JSON */
    }
    throw new StaffApiError(code, res.status);
  }
  return (await res.json()) as T;
}
