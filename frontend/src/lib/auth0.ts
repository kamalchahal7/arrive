import { Auth0Client } from "@auth0/nextjs-auth0/server";

// Staff sign-in (settlement workers, government analysts, admins). Reads AUTH0_DOMAIN, AUTH0_CLIENT_ID,
// AUTH0_CLIENT_SECRET, AUTH0_SECRET and APP_BASE_URL from the environment.
export const auth0 = new Auth0Client({
  authorizationParameters: {
    audience: process.env.AUTH0_AUDIENCE,
    scope: "openid profile email",
  },
});

export const ROLES_CLAIM = "https://arrive.app/roles";

export function rolesOf(user: Record<string, unknown> | undefined | null): string[] {
  const roles = user?.[ROLES_CLAIM];
  return Array.isArray(roles) ? roles.map(String) : [];
}

export function hasRole(user: Record<string, unknown> | undefined | null, role: string): boolean {
  const roles = rolesOf(user);
  return roles.includes("admin") || roles.includes(role);
}
