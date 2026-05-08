import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Magnificent8Forum
          </h1>
          <a
            href="/login"
            className="mt-6 inline-block rounded-lg bg-gray-900 px-6 py-3 font-medium text-white hover:bg-gray-800"
          >
            Sign in
          </a>
        </div>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("users")
    .select("is_moderator")
    .eq("id", user.id)
    .maybeSingle();

  const isModerator = profile?.is_moderator === true;

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">
          Magnificent8Forum
        </h1>
        <p className="mt-4 text-gray-600">
          Logged in as {user.email}
          {isModerator && (
            <span className="ml-2 text-sm text-gray-400">(Moderator)</span>
          )}
        </p>
        <SignOutButton />
      </div>
    </main>
  );
}
