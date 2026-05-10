"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();

    const { data: allowed, error: allowlistError } = await supabase.rpc(
      "is_email_allowed",
      { check_email: email }
    );

    if (allowlistError) {
      setLoading(false);
      setError(allowlistError.message);
      return;
    }

    if (!allowed) {
      setLoading(false);
      setError(
        "This email is not authorized to access Magnificent8Forum. Contact your moderator if you believe this is a mistake."
      );
      return;
    }

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    setLoading(false);

    if (otpError) {
      setError(otpError.message);
      return;
    }

    setStep("code");
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });

    if (verifyError) {
      setLoading(false);
      setError("That code didn't work. Check the email or request a new one.");
      return;
    }

    // Full navigation so the server-rendered home page sees the new auth cookies.
    window.location.href = "/";
  }

  function handleBack() {
    setStep("email");
    setCode("");
    setError("");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl tracking-tight">
            Magnificent8Forum
          </CardTitle>
          <CardDescription>
            {step === "email"
              ? "Enter your email to get a sign-in code."
              : "Enter the 6-digit code we just emailed you."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "email" ? (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Sending…" : "Send sign-in code"}
              </Button>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </form>
          ) : (
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <AlertTitle>Check your email</AlertTitle>
                <AlertDescription className="text-emerald-800">
                  We sent a code to{" "}
                  <span className="font-medium">{email}</span>. Check your
                  inbox (including spam) and enter the 6-digit code below.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="code">6-digit code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  placeholder="123456"
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  disabled={loading}
                  className="text-center text-2xl tracking-[0.5em]"
                />
              </div>

              <Button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full"
              >
                {loading ? "Signing in…" : "Sign in"}
              </Button>

              <button
                type="button"
                onClick={handleBack}
                disabled={loading}
                className="block w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
              >
                Use a different email
              </button>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
