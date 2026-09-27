// lib/supabase/client.ts
// Browser client. Only ever uses the public anon key — safe to ship to the
// client bundle. RLS is what actually protects data, not this file.
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
