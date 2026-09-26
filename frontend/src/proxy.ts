import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { auth0 } from "./lib/auth0";

const intl = createMiddleware(routing);

// Staff areas and the Auth0 routes (/auth/login, /auth/callback, ...) are not localized and need the session.
const STAFF_PREFIXES = ["/auth", "/worker", "/insights"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (STAFF_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return auth0.middleware(request);
  }
  // Newcomer pages need no account: language routing only.
  return intl(request);
}

export const config = {
  // Skip the API, Next internals and static files.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
