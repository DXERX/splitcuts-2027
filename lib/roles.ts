// lib/roles.ts
// Client-side role helpers.
//
// These helpers are for UX/navigation only:
// - deciding which navigation to show
// - deciding where to redirect a signed-in user
//
// Authorization and access control must remain enforced by
// Postgres RLS and server-side RPC/database policies.

export const APP_ROLES = [
  "owner",
  "manager",
  "cashier",
  "barber",
  "customer",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const STAFF_ROLES = [
  "owner",
  "manager",
  "cashier",
  "barber",
] as const satisfies readonly AppRole[];

/**
 * Returns true when the supplied role belongs to a staff account.
 */
export function isStaffRole(
  role: AppRole | null | undefined,
): boolean {
  if (!role) {
    return false;
  }

  return (STAFF_ROLES as readonly AppRole[]).includes(role);
}

/**
 * Where to send a signed-in user immediately after authentication.
 */
export function homeRouteForRole(
  role: AppRole | null | undefined,
): string {
  switch (role) {
    case "owner":
    case "manager":
      return "/admin";

    case "cashier":
      return "/cashier";

    case "barber":
      return "/barber";

    case "customer":
    default:
      return "/book";
  }
}