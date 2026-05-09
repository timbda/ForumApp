import Link from "next/link";
import { CalendarDays, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ErrorFallback } from "@/components/error-fallback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  createClient,
  getUserWithRetry,
  PausedProjectError,
  TransientFetchError,
} from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  let user;
  try {
    user = await getUserWithRetry(supabase, "home");
  } catch (err) {
    if (err instanceof PausedProjectError) return <ErrorFallback variant="paused" />;
    if (err instanceof TransientFetchError) return <ErrorFallback variant="transient" />;
    throw err;
  }

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

        <section className="mt-8">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Forum Meetings
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Schedule and manage your forum&apos;s group meetings.
            </p>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
        </section>

        <Separator className="my-10" />

        <section aria-labelledby="stir-fry-heading">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="stir-fry-heading"
                className="text-xl font-semibold tracking-tight"
              >
                Stir Fry 1:1 Meetings
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Arrange and track one-on-one coffee or lunch meetings between
                forum members. The goal: every member meets every other member
                at least once a year.
              </p>
            </div>
            <Badge variant="secondary" className="shrink-0">
              Coming Soon
            </Badge>
          </div>

          <div className="mt-4 cursor-default rounded-lg border bg-muted/40 p-6 text-muted-foreground">
            <p className="text-sm leading-relaxed">
              When this is ready you&apos;ll be able to schedule a coffee or
              lunch with any other forum member, log meetings as they happen,
              and see at a glance which pairs still need to meet this year.
            </p>
          </div>
        </section>
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
