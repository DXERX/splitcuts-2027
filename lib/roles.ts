// lib/roles.ts
// Client-side role helpers. These are UX conveniences only (which nav to
// show, which page to redirect to) -- the real enforcement is Postgres RLS
// and the RPCs in supabase/migrations. Never use this file to decide whether
// a request is *allowed*, only where to *route* it.
//
// NOTE: the live app_role enum is owner/manager/cashier/customer -- there is
// no "barber" account role. Barbers are just a table of service providers
// (see the `barbers` table); they don't sign in themselves today. The
// /barber schedule view is a staff tool (any branch staff can open it and
// pick which barber's day to look at), not a barber's personal login.

export const APP_ROLES = ["owner", "manager", "cashier", "customer"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const STAFF_ROLES: AppRole[] = ["owner", "manager", "cashier"];

export function isStaffRole(role: AppRole | null | undefined): boolean {
  return !!role && STAFF_ROLES.includes(role);
}

/** Where to send a signed-in user right after auth, based on their role. */
export function homeRouteForRole(role: AppRole | null | undefined): string {
  switch (role) {
    case "owner":
    case "manager":
      return "/admin";
    case "cashier":
      return "/cashier";
    case "customer":
    default:
      return "/book";
  }
}
