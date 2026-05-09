import Link from "next/link";
import { CalendarDays, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient, getUserWithRetry } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const user = await getUserWithRetry(supabase, "home");

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Magnificent8Forum
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to see your forum availability.
          </p>
          <Button asChild className="mt-6 w-full">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("users")
    .select("name, is_moderator")
    .eq("id", user.id)
    .maybeSingle();

  const fullName = profile?.name ?? user.email?.split("@")[0] ?? "there";
  const firstName = fullName.split(" ")[0];

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <header className="mt-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Welcome, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {profile?.is_moderator
              ? "You're signed in as the forum moderator."
              : "Manage your availability and see what the rest of the forum is up to."}
          </p>
        </header>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <ActionCard
            href="/calendar"
            icon={<CalendarDays className="h-6 w-6" />}
            title="My Availability"
            description="Mark which dates you're available for the next 12 months."
          />
          <ActionCard
            href="/members"
            icon={<Users className="h-6 w-6" />}
            title="Members"
            description="See the forum's eight members and who has reviewed availability."
          />
        </div>
      </div>
    </AppShell>
  );
}

function ActionCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="h-full transition-colors group-hover:border-foreground/30 group-hover:shadow-sm">
        <CardHeader>
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            {icon}
          </div>
          <CardTitle className="mt-3 text-lg">{title}</CardTitle>
          <CardDescription className="text-sm">{description}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}
