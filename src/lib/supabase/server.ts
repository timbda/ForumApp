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

// Thrown when getUserWithRetry exhausts its retries on transient fetch errors.
// Callers should render an error UI (not redirect to /login) — the session is
// likely still valid and a page refresh usually recovers.
export class TransientFetchError extends Error {
  readonly underlying: unknown;
  constructor(message: string, underlying?: unknown) {
    super(message);
    this.name = "TransientFetchError";
    this.underlying = underlying;
  }
}

// Subclass surfaced when the underlying fetch error looks like a paused-project
// response from Supabase. The UI message can then tell the user to wait a
// minute for the database to spin back up.
export class PausedProjectError extends TransientFetchError {
  constructor(message: string, underlying?: unknown) {
    super(message, underlying);
    this.name = "PausedProjectError";
  }
}

// Wraps supabase.auth.getUser() with retry-on-transient-error logic.
//
// We've observed intermittent TLS errors hitting Supabase's auth endpoint from
// Node on Windows ("ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC"). When that
// happens, getUser() returns { user: null, error: AuthRetryableFetchError }.
// Treating that as "not authenticated" would bounce a logged-in user to /login
// despite a still-valid session cookie.
//
// Behavior:
//   - If a user comes back, return them.
//   - If `error` is a transient fetch error, retry with exponential backoff.
//   - If `error` indicates real auth failure (or there is no error and no
//     user), return null — caller redirects.
//   - If all retries exhaust, throw TransientFetchError (or PausedProjectError
//     when the underlying response looks like Supabase's paused-project shape).
export async function getUserWithRetry(
  supabase: SupabaseClient,
  context: string
): Promise<User | null> {
  const BACKOFFS_MS = [100, 250, 500, 1000, 2000];
  const MAX_ATTEMPTS = BACKOFFS_MS.length;
  let lastError: { name?: string; message?: string; status?: number } | undefined;

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

    lastError = error;
    const status = (error as { status?: number }).status;
    console.warn(
      `[auth/${context}] transient getUser failure (attempt ${attempt}/${MAX_ATTEMPTS}): name=${error.name}, status=${status ?? "n/a"}, message=${error.message}`
    );

    if (attempt < MAX_ATTEMPTS) {
      await sleep(BACKOFFS_MS[attempt - 1]);
    }
  }

  if (lastError && isPausedProjectResponse(lastError)) {
    throw new PausedProjectError(
      `[auth/${context}] getUser failed after ${MAX_ATTEMPTS} retries: Supabase project appears to be paused.`,
      lastError
    );
  }
  throw new TransientFetchError(
    `[auth/${context}] getUser failed after ${MAX_ATTEMPTS} retries due to transient fetch errors. The session is likely still valid; refreshing the page should recover.`,
    lastError
  );
}

function isTransientFetchError(error: { name?: string; message?: string }): boolean {
  if (error.name === "AuthRetryableFetchError") return true;
  // Bare "fetch failed" TypeErrors can also slip through — most often the TLS
  // bug. Treat them as transient too.
  if (error.message?.includes("fetch failed")) return true;
  return false;
}

// Supabase returns HTTP 540 with a "project is paused" body when a project on
// the free tier has been idle. Match by status or message so we can surface a
// friendlier UI in that case.
function isPausedProjectResponse(error: { message?: string; status?: number }): boolean {
  if (error.status === 540) return true;
  const m = error.message?.toLowerCase() ?? "";
  return m.includes("project is paused") || m.includes("project paused");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
