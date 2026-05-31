"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { markAvailable, markUnavailable } from "@/app/calendar/actions";
import {
  formatLocalISO,
  generateMonths,
  monthLabel,
} from "@/app/calendar/dates";
import { notifyAvailabilityEdit } from "./actions";
import type { AvailabilityChange } from "@/lib/email/availability-update";

type Props = {
  memberId: string;
  memberName: string;
  availableDates: string[];
  finalizedDates: string[];
};

export function EditAvailability({
  memberId,
  memberName,
  availableDates,
  finalizedDates,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Snapshot the member's availability as it was when this session started.
  // "Changed dates" = the symmetric difference between this snapshot and the
  // live set, so toggling a date and then toggling it back counts as no change.
  const initialRef = useRef<Set<string>>(new Set(availableDates));
  const [availableSet, setAvailableSet] = useState<Set<string>>(
    () => new Set(availableDates)
  );

  const finalizedSet = new Set(finalizedDates);

  // Date awaiting confirmation before being marked NOT available because it has
  // a finalized meeting on it.
  const [confirmDate, setConfirmDate] = useState<string | null>(null);

  // Keep the latest set readable from the unmount cleanup without re-subscribing
  // the effect on every toggle. `sentRef` prevents a double-send when the email
  // was already dispatched by an explicit "Done" click. `touchedRef` records the
  // dates the moderator tapped (deduped) so we can diff them against the initial
  // snapshot without iterating a Set (the TS target only allows array iteration).
  const availableSetRef = useRef(availableSet);
  useEffect(() => {
    availableSetRef.current = availableSet;
  }, [availableSet]);
  const sentRef = useRef(false);
  const touchedRef = useRef<string[]>([]);

  const today = new Date();
  const todayISO = formatLocalISO(today);
  const months = generateMonths(today, 12);

  const computeChanges = useCallback((): AvailabilityChange[] => {
    const initial = initialRef.current;
    const live = availableSetRef.current;
    const changes: AvailabilityChange[] = [];
    for (const d of touchedRef.current) {
      const before = initial.has(d);
      const after = live.has(d);
      if (before !== after) changes.push({ date: d, available: after });
    }
    return changes;
  }, []);

  // Fires the notification email iff 2+ dates changed this session. Idempotent
  // via sentRef so "Done" + the unmount cleanup don't both send.
  const maybeNotify = useCallback(() => {
    if (sentRef.current) return;
    const changes = computeChanges();
    if (changes.length < 2) return;
    sentRef.current = true;
    // Fire-and-forget: navigation shouldn't wait on the email, and the
    // availability rows are already saved regardless.
    notifyAvailabilityEdit(memberId, changes).catch((err) =>
      console.error("[notifyAvailabilityEdit]", err)
    );
  }, [computeChanges, memberId]);

  // Best-effort send if the moderator leaves via in-app navigation (e.g. the
  // bottom nav) instead of the Done button. A hard tab/browser close cannot
  // reliably complete a server action — Done is the authoritative trigger.
  useEffect(() => {
    return () => {
      maybeNotify();
    };
  }, [maybeNotify]);

  function commitToggle(iso: string, wasAvail: boolean) {
    if (!touchedRef.current.includes(iso)) touchedRef.current.push(iso);
    const next = new Set(availableSet);
    if (wasAvail) next.delete(iso);
    else next.add(iso);
    setAvailableSet(next);

    startTransition(async () => {
      try {
        if (wasAvail) await markUnavailable(iso, memberId);
        else await markAvailable(iso, memberId);
      } catch (err) {
        console.error("On-behalf toggle failed:", err);
        // Revert the optimistic change.
        setAvailableSet((cur) => {
          const reverted = new Set(cur);
          if (wasAvail) reverted.add(iso);
          else reverted.delete(iso);
          return reverted;
        });
        toast.error("Couldn't save change. Please try again.");
      }
    });
  }

  function handleToggle(iso: string) {
    const wasAvail = availableSet.has(iso);
    // Marking a finalized-meeting date as NOT available needs confirmation.
    if (wasAvail && finalizedSet.has(iso)) {
      setConfirmDate(iso);
      return;
    }
    commitToggle(iso, wasAvail);
  }

  function handleDone() {
    maybeNotify();
    router.push("/members");
  }

  return (
    <div>
      {/* Banner */}
      <div className="sticky top-0 z-10 -mx-4 mb-4 flex items-center justify-between gap-3 border-b bg-amber-50 px-4 py-3 sm:-mx-6 sm:px-6">
        <p className="min-w-0 text-sm font-medium text-amber-900">
          Editing availability on behalf of{" "}
          <span className="font-semibold">{memberName}</span>
        </p>
        <Button size="sm" variant="outline" onClick={handleDone} className="shrink-0">
          Done
        </Button>
      </div>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {memberName}&apos;s availability
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Changes save automatically. Tap a date to mark {memberName} available;
          tap again to mark them not available.
        </p>
      </header>

      <div className="mx-auto mt-4 max-w-md">
        {months.map((m) => (
          <section key={`${m.year}-${m.month}`} className="mt-6">
            <h2 className="px-1 text-base font-semibold tracking-tight text-foreground">
              {monthLabel(m.year, m.month)}
            </h2>
            <div className="mt-2 grid grid-cols-4 gap-1.5 text-center text-xs font-medium text-muted-foreground">
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
            </div>
            <div className="mt-1 grid grid-cols-4 gap-1.5">
              {m.cells.map((cell, i) => {
                if (cell === null) {
                  return <div key={i} className="aspect-square" />;
                }
                const iso = cell.iso;
                const isAvail = availableSet.has(iso);
                const isFinalized = finalizedSet.has(iso);
                const isToday = iso === todayISO;
                const isPast = iso < todayISO;

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleToggle(iso)}
                    className={cn(
                      "flex aspect-square min-h-[44px] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg border px-1 text-base font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      isFinalized
                        ? "border-blue-700 bg-blue-700 text-white hover:bg-blue-700/90"
                        : isAvail
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                          : "border-border bg-muted/40 text-foreground hover:bg-muted",
                      isPast && "opacity-60",
                      isToday &&
                        !isFinalized &&
                        "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                      isFinalized &&
                        "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    )}
                    aria-pressed={isAvail}
                    aria-label={`${cell.iso}${
                      isAvail ? " (available)" : " (not available)"
                    }${isFinalized ? " (finalized meeting)" : ""}`}
                  >
                    <span>{cell.day}</span>
                    {isFinalized && (
                      <CalendarIcon className="h-3 w-3 opacity-90" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <AlertDialog
        open={confirmDate !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmDate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {memberName} from this meeting?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDate ? formatLongDate(confirmDate) : ""} has a finalized
              meeting. Marking {memberName} not available won&apos;t cancel the
              meeting, but they&apos;ll show as not available for it. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDate(null)}>
              Keep available
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDate) commitToggle(confirmDate, true);
                setConfirmDate(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Mark not available
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
