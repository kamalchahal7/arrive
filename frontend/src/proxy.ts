import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Skip the API, Next internals, static files, and the staff routes (worker, insights, auth), which are not localized.
  matcher: "/((?!api|_next|_vercel|worker|insights|auth|.*\\..*).*)",
};
