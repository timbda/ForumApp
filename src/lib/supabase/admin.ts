import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client that uses the service-role key.
//
// THE SERVICE ROLE KEY BYPASSES ALL ROW LEVEL SECURITY POLICIES. Anyone holding
// it can read or modify any row in any table. Treat it like a database password:
//
//   - NEVER import this module from a client component, page that gets statically
//     rendered to the client, or any file that ends up in the browser bundle.
//   - NEVER expose process.env.SUPABASE_SERVICE_ROLE_KEY through any
//     NEXT_PUBLIC_-prefixed variable. The unprefixed name keeps Next.js from
//     inlining it into client-side JS.
//   - Only call this from inside a server action ("use server" directive) or a
//     server component / route handler that requires admin access.
//
// We disable session persistence and auto-refresh: the service role isn't a user
// session and doesn't need either feature.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — admin client cannot be created"
    );
  }
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
