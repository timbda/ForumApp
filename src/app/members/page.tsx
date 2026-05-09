import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MembersList } from "./members-list";

export default async function MembersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [membersRes, profileRes] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, email, is_moderator, last_reviewed_at")
      .order("name"),
    supabase
      .from("users")
      .select("is_moderator")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const members = membersRes.data ?? [];
  const isModerator = profileRes.data?.is_moderator === true;

  return (
    <MembersList
      members={members}
      currentUserId={user.id}
      currentUserIsModerator={isModerator}
    />
  );
}
