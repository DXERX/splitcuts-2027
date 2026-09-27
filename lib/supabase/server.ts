// lib/supabase/server.ts
// Server-side client for Server Components / Route Handlers / Server
// Actions. Uses the anon key + the caller's cookies, so RLS applies exactly
// as it would in the browser — this is NOT the service-role client.
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component with no request context to
            // write to. Safe to ignore as long as middleware.ts refreshes
            // the session on every request.
          }
        },
      },
    },
  );
}

/**
 * Service-role client. Server-only — never import this from a file that
 * could end up in a Client Component bundle. Used exclusively inside Route
 * Handlers / Server Actions / Edge Functions for operations RLS should not
 * gate (e.g. admin tooling, webhooks).
 */
export function createServiceRoleClient() {
  if (typeof window !== "undefined") {
    throw new Error("createServiceRoleClient must never be called from the browser");
  }

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
