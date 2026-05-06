"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <button
      onClick={handleSignOut}
      className="mt-4 rounded-lg border border-gray-300 px-6 py-3 font-medium text-gray-900 hover:bg-gray-50"
    >
      Sign out
    </button>
  );
}
