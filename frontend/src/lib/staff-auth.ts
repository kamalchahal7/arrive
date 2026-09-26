import "server-only";
import { redirect } from "next/navigation";
import { auth0, hasRole, rolesOf } from "./auth0";

export type StaffUser = { name: string; email: string | null; roles: string[] };

/** Sends signed-out visitors to Auth0; returns the user and whether they hold the role. */
export async function requireStaff(role: string, returnTo: string): Promise<{ user: StaffUser; allowed: boolean }> {
  const session = await auth0.getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  const u = session.user as Record<string, unknown>;
  return {
    user: {
      name: String(u.name || u.email || "Staff"),
      email: (u.email as string) || null,
      roles: rolesOf(u),
    },
    allowed: hasRole(u, role),
  };
}
