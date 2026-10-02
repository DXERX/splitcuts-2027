// lib/staffBranch.ts
// Single source of truth for "which branch(es) can this signed-in staff
// member see" -- matches exactly what RLS itself checks
// (is_branch_staff()/is_branch_manager(), migration 0004): an active
// profiles.branch_id row with role in (owner, manager, cashier) OR an
// active staff_roles row for that branch (is_owner() also bypasses branch
// scoping entirely, handled separately by callers).
//
// A page that resolves its own branch id by guessing -- e.g. falling back
// to "the first active branch in the whole system" when neither of those
// is set for this user -- can end up querying a branch the signed-in staff
// member isn't actually entitled to. The client-side query then "succeeds"
// (no error, no null-gate blocking it) but RLS silently returns zero rows,
// which looks exactly like "this board never gets any data" from the
// outside. This helper only ever returns a branch the user is genuinely
// assigned to, so that failure mode becomes an honest "not assigned to a
// branch yet" state instead of a silent empty board.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** Every branch this user is an active staff member of, per either
 * profiles.branch_id (role owner/manager/cashier) or staff_roles -- the
 * same two sources is_branch_staff()/is_branch_manager() check. */
export async function getStaffBranchIds(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string[]> {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("branch_id, role, is_active").eq("id", userId).maybeSingle(),
    supabase.from("staff_roles").select("branch_id").eq("user_id", userId).eq("is_active", true),
  ]);

  const ids = new Set<string>();
  if (
    profile?.is_active &&
    profile.branch_id &&
    (profile.role === "owner" || profile.role === "manager" || profile.role === "cashier")
  ) {
    ids.add(profile.branch_id);
  }
  for (const r of roles ?? []) {
    if (r.branch_id) ids.add(r.branch_id);
  }
  return [...ids];
}

/** Convenience for a single-branch UI (cashier board, barber board) --
 * picks the first branch this staff member is assigned to. */
export async function getStaffBranchId(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  const ids = await getStaffBranchIds(supabase, userId);
  return ids[0] ?? null;
}
