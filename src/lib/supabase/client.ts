import { createBrowserClient } from "@supabase/ssr";

// @supabase/ssr 0.10.2 unconditionally sets `auth.flowType = "pkce"` after spreading
// caller-supplied options, so passing `auth: { flowType: "implicit" }` is silently
// ignored. We need implicit flow because PKCE ties the magic-link verifier to the
// browser session that requested the link — that breaks the common case of requesting
// from a phone and clicking from a laptop. Mutating the protected `flowType` field
// after construction works because @supabase/auth-js reads `this.flowType` at
// signInWithOtp call time, not at construction time. If @supabase/ssr is ever bumped,
// re-verify this override still wins (see node_modules/@supabase/ssr/dist/.../createBrowserClient.js).
export function createClient() {
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  (client.auth as unknown as { flowType: string }).flowType = "implicit";
  return client;
}
