import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // See src/lib/supabase/client.ts for the rationale behind the flowType mutation.
  // Aligning the middleware client with the others avoids subtle inconsistencies if
  // any code path here ever calls signInWithOtp.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  (supabase.auth as unknown as { flowType: string }).flowType = "implicit";

  // Refresh the user's session token on every request.
  // Always use getUser() (not getSession()) — it validates with the auth server.
  await supabase.auth.getUser();

  return response;
}
