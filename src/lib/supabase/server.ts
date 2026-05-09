import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// See src/lib/supabase/client.ts for the rationale behind the flowType mutation.
// @supabase/ssr 0.10.2 hardcodes `auth.flowType = "pkce"` in createServerClient as well,
// so we override post-construction here too for consistency. This matters less on the
// server (no signInWithOtp here) but keeps all three Supabase client factories aligned.
export async function createClient() {
  const cookieStore = cookies();

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — cookie writes are ignored.
            // The middleware handles session refresh instead.
          }
        },
      },
    }
  );

  (client.auth as unknown as { flowType: string }).flowType = "implicit";
  return client;
}
