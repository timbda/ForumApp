"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type ErrorFallbackVariant = "transient" | "paused";

const COPY: Record<ErrorFallbackVariant, { title: string; body: string }> = {
  transient: {
    title: "Couldn't reach the server",
    body: "Please refresh.",
  },
  paused: {
    title: "Database is starting up",
    body: "This can take a minute when the app hasn't been used in a while. Please refresh shortly.",
  },
};

export function ErrorFallback({ variant }: { variant: ErrorFallbackVariant }) {
  const { title, body } = COPY[variant];
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{body}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => location.reload()} className="w-full">
            Refresh
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
