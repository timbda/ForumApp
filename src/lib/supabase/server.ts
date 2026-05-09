import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
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

// Wraps supabase.auth.getUser() with retry-on-transient-error logic.
//
// We've observed intermittent TLS errors hitting Supabase's auth endpoint from
// Node on Windows ("ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC"). When that
// happens, getUser() returns { user: null, error: AuthRetryableFetchError }.
// The previous code only destructured `user`, treating null-user-with-error
// identically to "not authenticated", and bounced the user to /login despite
// the session cookie still being valid.
//
// New behavior:
//   - If a user comes back, return them.
//   - If `error` is a transient fetch error, retry up to MAX_ATTEMPTS times
//     with linear backoff (100ms, 200ms).
//   - If `error` indicates real auth failure (or there is no error and no
//     user), return null — caller redirects.
//   - If all retries exhaust on transient errors, throw. Caller surfaces an
//     error boundary instead of falsely redirecting a logged-in user.
//
// `context` shows up in logs so future occurrences can be traced to which
// page initiated the failing call.
export async function getUserWithRetry(
  supabase: SupabaseClient,
  context: string
): Promise<User | null> {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (user) {
      if (attempt > 1) {
        console.log(
          `[auth/${context}] getUser succeeded on retry ${attempt}: user=${user.id}`
        );
      }
      return user;
    }

    if (!error || !isTransientFetchError(error)) {
      // No user + (no error OR a real auth error) = legitimately not
      // authenticated. Caller decides whether to redirect.
      console.log(
        `[auth/${context}] no authenticated user (attempt ${attempt}, error=${error?.name ?? "none"})`
      );
      return null;
    }

    console.warn(
      `[auth/${context}] transient getUser failure (attempt ${attempt}/${MAX_ATTEMPTS}): ${error.name}: ${error.message}`
    );
    if (attempt < MAX_ATTEMPTS) {
      await sleep(100 * attempt);
    }
  }

  throw new Error(
    `[auth/${context}] getUser failed after ${MAX_ATTEMPTS} retries due to transient fetch errors. The session is likely still valid; refreshing the page should recover.`
  );
}

function isTransientFetchError(error: { name?: string; message?: string }): boolean {
  if (error.name === "AuthRetryableFetchError") return true;
  // Bare "fetch failed" TypeErrors can also slip through — most often the TLS
  // bug. Treat them as transient too.
  if (error.message?.includes("fetch failed")) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
