// Browser-side client for the public Arrive API. Errors carry the backend's translatable error code.

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}

type Options = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
};

export async function api<T>(path: string, { method = "GET", body, form, signal }: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      signal,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError("offline", 0);
  }
  if (!res.ok) {
    let code = "internal_error";
    try {
      code = ((await res.json()) as { error?: string }).error || code;
    } catch {
      /* not JSON */
    }
    throw new ApiError(code, res.status);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("content-type") || "";
  return (type.includes("application/json") ? await res.json() : await res.blob()) as T;
}

export function errorCode(err: unknown): string {
  return err instanceof ApiError ? err.code : "internal_error";
}
