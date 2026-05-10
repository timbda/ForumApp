import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const SUPPORTED_EMAIL_OTP_TYPES: readonly EmailOtpType[] = [
  "magiclink",
  "signup",
  "recovery",
  "email_change",
  "invite",
];

function isSupportedEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (SUPPORTED_EMAIL_OTP_TYPES as readonly string[]).includes(value);
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  console.log(
    "[auth/callback] incoming params:",
    Object.fromEntries(searchParams.entries()),
  );

  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/`);
    }
    console.error("[auth/callback] exchangeCodeForSession failed:", error);
  } else if (token_hash && isSupportedEmailOtpType(rawType)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: rawType,
    });
    if (!error) {
      return NextResponse.redirect(`${origin}/`);
    }
    console.error(
      `[auth/callback] verifyOtp failed (type=${rawType}):`,
      error,
    );
  } else if (token_hash) {
    console.error(
      `[auth/callback] unsupported or missing type for token_hash flow: type=${rawType}`,
    );
  } else {
    console.error(
      "[auth/callback] no code or token_hash+type found in callback URL",
    );
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
