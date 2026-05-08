"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();

    const { data: allowed, error: allowlistError } = await supabase.rpc(
      "is_email_allowed",
      { check_email: email },
    );

    if (allowlistError) {
      setLoading(false);
      setError(allowlistError.message);
      return;
    }

    if (!allowed) {
      setLoading(false);
      setError(
        "This email is not authorized to access Magnificent8Forum. Contact your moderator if you believe this is a mistake.",
      );
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSubmitted(true);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-gray-900 text-center">
          Magnificent8Forum
        </h1>

        {submitted ? (
          <p className="mt-6 text-center text-gray-600">
            Check your email for a sign-in link.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6">
            <p className="text-center text-gray-600 mb-6">
              Enter your email to get a sign-in link
            </p>

            <label htmlFor="email" className="sr-only">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />

            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full rounded-lg bg-gray-900 px-4 py-3 font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send me a sign-in link"}
            </button>

            {error && (
              <p className="mt-4 text-center text-sm text-red-600">{error}</p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
