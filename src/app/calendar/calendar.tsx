"use client";

import { useOptimistic, useState, useTransition } from "react";
import { CheckCircle2, ChevronDown, Clock } from "lucide-react";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { markAvailable, markUnavailable } from "./actions";
import { finalizeMeeting, unfinalizeMeeting } from "./meeting-actions";
import { formatLocalISO } from "./dates";

type MemberStatus = { name: string; last_reviewed_at: string | null };

type CalendarProps = {
  availableDates: string[];
  availabilityCounts: Record<string, number>;
  availabilityByDate: Record<string, string[]>;
  finalizedDates: string[];
  meetingLocations: Record<string, string | null>;
  totalMembers: number;
  isModerator: boolean;
  reviewedRecentlyCount: number;
  memberStatuses: MemberStatus[];
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type Cell = { day: number; iso: string } | null;
type Month = { year: number; month: number; cells: Cell[] };

type View = "mine" | "group";
type AvailAction = { date: string; mark: "available" | "unavailable" };
type FinalizedAction = { date: string; op: "add" | "remove" };
type Confirm = { date: string; action: "finalize" | "unfinalize" };

export function Calendar({
  availableDates,
  availabilityCounts,
  availabilityByDate,
  finalizedDates,
  meetingLocations,
  totalMembers,
  isModerator,
  reviewedRecentlyCount,
  memberStatuses,
}: CalendarProps) {
  const [view, setView] = useState<View>("mine");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [openPopoverDate, setOpenPopoverDate] = useState<string | null>(null);

  const [optimisticAvail, applyAvail] = useOptimistic<
    Set<string>,
    AvailAction
  >(new Set(availableDates), (state, action) => {
    const next = new Set(state);
    if (action.mark === "available") next.add(action.date);
    else next.delete(action.date);
    return next;
  });

  const [optimisticFinalized, applyFinalized] = useOptimistic<
    Set<string>,
    FinalizedAction
  >(new Set(finalizedDates), (state, action) => {
    const next = new Set(state);
    if (action.op === "add") next.add(action.date);
    else next.delete(action.date);
    return next;
  });

  const [, startTransition] = useTransition();

  const today = new Date();
  const todayISO = formatLocalISO(today);
  const months = generateMonths(today, 12);

  function handleMineToggle(dateISO: string) {
    const isAvail = optimisticAvail.has(dateISO);
    startTransition(async () => {
      applyAvail({
        date: dateISO,
        mark: isAvail ? "unavailable" : "available",
      });
      try {
        if (isAvail) await markUnavailable(dateISO);
        else await markAvailable(dateISO);
      } catch (err) {
        console.error("Toggle failed:", err);
        toast.error("Couldn't save change. Please try again.");
      }
    });
  }

  function openConfirmFromPopover(dateISO: string) {
    setOpenPopoverDate(null);
    setConfirm({
      date: dateISO,
      action: optimisticFinalized.has(dateISO) ? "unfinalize" : "finalize",
    });
  }

  function handleConfirmYes() {
    if (!confirm) return;
    const c = confirm;
    setConfirm(null);
    startTransition(async () => {
      applyFinalized({
        date: c.date,
        op: c.action === "finalize" ? "add" : "remove",
      });
      try {
        if (c.action === "finalize") {
          await finalizeMeeting(c.date);
          toast.success(`Meeting finalized for ${formatLongDate(c.date)}`);
        } else {
          await unfinalizeMeeting(c.date);
          toast.success(`Meeting cancelled for ${formatLongDate(c.date)}`);
        }
      } catch (err) {
        console.error("Meeting action failed:", err);
        toast.error("Couldn't update the meeting. Please try again.");
      }
    });
  }

  return (
    <div>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">My Availability</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Changes save automatically. All dates start as unavailable — tap a
          date to mark yourself available.
        </p>
        <Tabs
          value={view}
          onValueChange={(v) => setView(v as View)}
          className="mt-4"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="mine">My availability</TabsTrigger>
            <TabsTrigger value="group">Group availability</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <div className="mx-auto mt-4 max-w-md">
        {view === "group" && (
          <Collapsible
            open={bannerOpen}
            onOpenChange={setBannerOpen}
            className="mb-4"
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-primary/10"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {reviewedRecentlyCount} of {totalMembers} members reviewed
                    availability in the last 30 days
                  </span>
                  {!bannerOpen && (
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      Tap to see who has and hasn&apos;t reviewed
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
                    bannerOpen && "rotate-180"
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-2 divide-y divide-border rounded-lg border">
                {memberStatuses.map((m, idx) => {
                  const status = reviewedStatusIcon(m.last_reviewed_at);
                  return (
                    <li
                      key={`${m.name}-${idx}`}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <span className="truncate text-foreground">{m.name}</span>
                      <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                        {status && (
                          <span
                            aria-hidden="true"
                            className={cn(
                              "inline-block w-3 text-center",
                              status.cls
                            )}
                          >
                            {status.icon}
                          </span>
                        )}
                        {lastReviewedLabel(m.last_reviewed_at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}

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
                const isFinalized = optimisticFinalized.has(iso);
                const isToday = iso === todayISO;
                const isPast = iso < todayISO;

                if (view === "mine") {
                  return renderMineCell({
                    key: i,
                    cell,
                    isAvail: optimisticAvail.has(iso),
                    isFinalized,
                    isToday,
                    isPast,
                    onClick: () => handleMineToggle(iso),
                  });
                }

                const availCount = availabilityCounts[iso] ?? 0;
                return (
                  <GroupCell
                    key={i}
                    cell={cell}
                    availCount={availCount}
                    totalMembers={totalMembers}
                    isFinalized={isFinalized}
                    isToday={isToday}
                    isModerator={isModerator}
                    open={openPopoverDate === iso}
                    onOpenChange={(o) =>
                      setOpenPopoverDate(o ? iso : null)
                    }
                    availableNames={availabilityByDate[iso] ?? []}
                    meetingLocation={meetingLocations[iso] ?? null}
                    memberStatuses={memberStatuses}
                    onAction={() => openConfirmFromPopover(iso)}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <ConfirmDialog
        confirm={confirm}
        onCancel={() => setConfirm(null)}
        onConfirm={handleConfirmYes}
      />
    </div>
  );
}

function renderMineCell(args: {
  key: number;
  cell: { day: number; iso: string };
  isAvail: boolean;
  isFinalized: boolean;
  isToday: boolean;
  isPast: boolean;
  onClick: () => void;
}) {
  const { key, cell, isAvail, isFinalized, isToday, isPast, onClick } = args;
  return (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={cn(
        "flex aspect-square min-h-[44px] items-center justify-center rounded-lg border text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isAvail
          ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
          : "border-border bg-muted/40 text-foreground hover:bg-muted",
        isPast && "opacity-60",
        isToday && !isFinalized && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
        isFinalized && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
      aria-pressed={isAvail}
      aria-label={`${cell.iso}${isAvail ? " (available)" : " (unavailable)"}${
        isFinalized ? " (finalized meeting)" : ""
      }`}
    >
      {cell.day}
    </button>
  );
}

function GroupCell(args: {
  cell: { day: number; iso: string };
  availCount: number;
  totalMembers: number;
  isFinalized: boolean;
  isToday: boolean;
  isModerator: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableNames: string[];
  meetingLocation: string | null;
  memberStatuses: MemberStatus[];
  onAction: () => void;
}) {
  const {
    cell,
    availCount,
    totalMembers,
    isFinalized,
    isToday,
    isModerator,
    open,
    onOpenChange,
    availableNames,
    meetingLocation,
    memberStatuses,
    onAction,
  } = args;
  const heat = heatmapClasses(availCount, totalMembers);
  const label = `${cell.iso}: ${availCount} of ${totalMembers} available${
    isFinalized ? " (finalized meeting)" : ""
  }`;
  const countText =
    totalMembers > 0 ? `${availCount}/${totalMembers}` : String(availCount);

  const cls = cn(
    "flex aspect-square min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg border border-transparent leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:opacity-90",
    heat,
    isToday && !isFinalized && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
    isFinalized && "ring-2 ring-primary ring-offset-2 ring-offset-background"
  );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" className={cls} aria-label={label}>
          <span className="text-base font-semibold">{cell.day}</span>
          <span className="text-[10px] font-medium opacity-90">{countText}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72 p-0">
        <GroupCellPopoverBody
          iso={cell.iso}
          availableNames={availableNames}
          memberStatuses={memberStatuses}
          isFinalized={isFinalized}
          meetingLocation={meetingLocation}
          isModerator={isModerator}
          onAction={onAction}
        />
      </PopoverContent>
    </Popover>
  );
}

function GroupCellPopoverBody({
  iso,
  availableNames,
  memberStatuses,
  isFinalized,
  meetingLocation,
  isModerator,
  onAction,
}: {
  iso: string;
  availableNames: string[];
  memberStatuses: MemberStatus[];
  isFinalized: boolean;
  meetingLocation: string | null;
  isModerator: boolean;
  onAction: () => void;
}) {
  const availableSet = new Set(availableNames);
  const nowMs = Date.now();

  const available: string[] = [];
  const notAvailable: string[] = [];
  const notReviewed: string[] = [];

  for (const m of memberStatuses) {
    if (availableSet.has(m.name)) {
      available.push(m.name);
      continue;
    }
    const reviewedRecently =
      m.last_reviewed_at !== null &&
      nowMs - new Date(m.last_reviewed_at).getTime() <= THIRTY_DAYS_MS;
    if (reviewedRecently) notAvailable.push(m.name);
    else notReviewed.push(m.name);
  }

  const sectionsRendered: number =
    (available.length > 0 ? 1 : 0) +
    (notAvailable.length > 0 ? 1 : 0) +
    (notReviewed.length > 0 ? 1 : 0);

  return (
    <div className="flex flex-col">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-semibold leading-tight">
          {formatLongDate(iso)}
        </p>
      </div>

      {isFinalized && (
        <div className="flex items-start gap-2 border-b bg-primary/5 px-4 py-3 text-xs">
          <CheckCircle2
            className="mt-0.5 h-4 w-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div className="leading-snug">
            <p className="font-medium text-foreground">
              Meeting confirmed for this date, 4:00–8:00pm
            </p>
            {meetingLocation && (
              <p className="mt-0.5 text-muted-foreground">{meetingLocation}</p>
            )}
          </div>
        </div>
      )}

      <div className="px-4 py-3">
        {available.length > 0 && (
          <PopoverSection
            label="Available"
            count={available.length}
            members={available}
            renderItem={(name) => (
              <li key={name} className="flex items-center gap-2 py-0.5 text-sm">
                <CheckCircle2
                  className="h-4 w-4 shrink-0 text-emerald-600"
                  aria-hidden="true"
                />
                <span className="text-foreground">{name}</span>
              </li>
            )}
          />
        )}

        {available.length > 0 && notAvailable.length > 0 && (
          <Separator className="my-3" />
        )}

        {notAvailable.length > 0 && (
          <PopoverSection
            label="Not available"
            count={notAvailable.length}
            members={notAvailable}
            renderItem={(name) => (
              <li
                key={name}
                className="py-0.5 pl-6 text-sm text-muted-foreground"
              >
                {name}
              </li>
            )}
          />
        )}

        {(available.length > 0 || notAvailable.length > 0) &&
          notReviewed.length > 0 && <Separator className="my-3" />}

        {notReviewed.length > 0 && (
          <PopoverSection
            label="Not yet reviewed"
            count={notReviewed.length}
            members={notReviewed}
            renderItem={(name) => (
              <li
                key={name}
                className="flex items-center gap-2 py-0.5 text-sm text-amber-700 dark:text-amber-500"
              >
                <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{name}</span>
              </li>
            )}
          />
        )}

        {sectionsRendered === 0 && (
          <p className="text-sm text-muted-foreground">No members yet.</p>
        )}
      </div>

      {isModerator && (
        <div className="border-t px-4 py-3">
          <Button
            type="button"
            onClick={onAction}
            variant={isFinalized ? "destructive" : "default"}
            className="w-full"
          >
            {isFinalized ? "Cancel this meeting" : "Finalize this meeting"}
          </Button>
        </div>
      )}
    </div>
  );
}

function PopoverSection({
  label,
  count,
  members,
  renderItem,
}: {
  label: string;
  count: number;
  members: string[];
  renderItem: (name: string) => React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label} ({count})
      </p>
      <ul className="mt-1.5">{members.map(renderItem)}</ul>
    </div>
  );
}

function heatmapClasses(available: number, total: number): string {
  if (total <= 0) return "bg-muted text-muted-foreground";
  const pct = available / total;
  if (pct >= 1) return "bg-emerald-700 text-white";
  if (pct >= 0.75) return "bg-emerald-300 text-emerald-950";
  if (pct >= 0.5) return "bg-yellow-200 text-yellow-950";
  if (pct >= 0.25) return "bg-orange-400 text-white";
  return "bg-red-700 text-white";
}

function ConfirmDialog({
  confirm,
  onCancel,
  onConfirm,
}: {
  confirm: Confirm | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isFinalize = confirm?.action === "finalize";
  const longDate = confirm ? formatLongDate(confirm.date) : "";
  const open = confirm !== null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isFinalize
              ? `Finalize meeting on ${longDate}?`
              : `Cancel meeting on ${longDate}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            All members will be notified.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            {isFinalize ? "Cancel" : "Keep"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={cn(
              !isFinalize &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            )}
          >
            {isFinalize ? "Finalize" : "Cancel meeting"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function lastReviewedLabel(iso: string | null): string {
  if (!iso) return "Not yet reviewed";
  const reviewedAt = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - reviewedAt.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 30) {
    return `Reviewed ${reviewedAt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  }
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) return "Reviewed just now";
    return `Reviewed ${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }
  if (diffDays === 1) return "Reviewed 1 day ago";
  return `Reviewed ${diffDays} days ago`;
}

function reviewedStatusIcon(
  iso: string | null
): { icon: string; cls: string } | null {
  if (iso === null) return { icon: "⊘", cls: "text-muted-foreground" };
  const reviewedAt = new Date(iso).getTime();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  if (Date.now() - reviewedAt <= thirtyDaysMs) {
    return { icon: "✓", cls: "text-emerald-600" };
  }
  return null;
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

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function generateMonths(start: Date, count: number): Month[] {
  const out: Month[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();

    const cells: Cell[] = [];
    let row: Cell[] = [null, null, null, null];
    let rowHasContent = false;

    for (let dayNum = 1; dayNum <= lastDay; dayNum++) {
      const dt = new Date(year, month, dayNum);
      const dow = dt.getDay();

      if (dow === 1 && rowHasContent) {
        cells.push(...row);
        row = [null, null, null, null];
        rowHasContent = false;
      }

      if (dow >= 1 && dow <= 4) {
        row[dow - 1] = { day: dayNum, iso: formatLocalISO(dt) };
        rowHasContent = true;
      }
    }
    if (rowHasContent) cells.push(...row);

    out.push({ year, month, cells });
  }
  return out;
}
