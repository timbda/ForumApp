"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Calendar as CalendarIcon, CheckCircle2, ChevronDown, Clock } from "lucide-react";
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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { markAvailable, markUnavailable } from "./actions";
import {
  finalizeMeeting,
  unfinalizeMeeting,
  type FinalizeMeetingInput,
} from "./meeting-actions";
import { formatLocalISO } from "./dates";

type MemberStatus = { name: string; last_reviewed_at: string | null };

export type MeetingDetails = {
  date: string;
  startTime: string; // "HH:MM:SS"
  endTime: string;   // "HH:MM:SS"
  location: string | null;
};

type CalendarProps = {
  availableDates: string[];
  availabilityCounts: Record<string, number>;
  availabilityByDate: Record<string, string[]>;
  meetings: MeetingDetails[]; // sorted ascending by date
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

const DEFAULT_START_TIME = "16:00";
const DEFAULT_END_TIME = "20:00";

export function Calendar({
  availableDates,
  availabilityCounts,
  availabilityByDate,
  meetings,
  totalMembers,
  isModerator,
  reviewedRecentlyCount,
  memberStatuses,
}: CalendarProps) {
  const meetingsByDate = new Map(meetings.map((m) => [m.date, m]));
  const finalizedDates = meetings.map((m) => m.date);
  const [view, setView] = useState<View>("mine");
  const [finalizeForDate, setFinalizeForDate] = useState<string | null>(null);
  const [cancelForDate, setCancelForDate] = useState<string | null>(null);
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
    if (optimisticFinalized.has(dateISO)) {
      setCancelForDate(dateISO);
    } else {
      setFinalizeForDate(dateISO);
    }
  }

  function handleFinalizeSubmit(input: Omit<FinalizeMeetingInput, "date">) {
    if (!finalizeForDate) return;
    const dateISO = finalizeForDate;
    setFinalizeForDate(null);
    startTransition(async () => {
      applyFinalized({ date: dateISO, op: "add" });
      try {
        await finalizeMeeting({ date: dateISO, ...input });
        toast.success(`Meeting finalized for ${formatLongDate(dateISO)}`);
      } catch (err) {
        console.error("Meeting finalize failed:", err);
        toast.error("Couldn't finalize the meeting. Please try again.");
      }
    });
  }

  function handleCancelConfirm(reason: string | null) {
    if (!cancelForDate) return;
    const dateISO = cancelForDate;
    setCancelForDate(null);
    startTransition(async () => {
      applyFinalized({ date: dateISO, op: "remove" });
      try {
        await unfinalizeMeeting(dateISO, reason);
        toast.success(`Meeting cancelled for ${formatLongDate(dateISO)}`);
      } catch (err) {
        console.error("Meeting cancel failed:", err);
        toast.error("Couldn't cancel the meeting. Please try again.");
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
      </header>

      <div className="mx-auto mt-4 max-w-md">
        <UpcomingMeetingsCard
          meetings={meetings}
          todayISO={todayISO}
          isModerator={isModerator}
          onCancel={(iso) => setCancelForDate(iso)}
        />

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

        {view === "group" && (
          <Collapsible
            open={bannerOpen}
            onOpenChange={setBannerOpen}
            className="mt-4"
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
                    meeting={meetingsByDate.get(iso) ?? null}
                    memberStatuses={memberStatuses}
                    onAction={() => openConfirmFromPopover(iso)}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <FinalizeMeetingDialog
        dateISO={finalizeForDate}
        onClose={() => setFinalizeForDate(null)}
        onSubmit={handleFinalizeSubmit}
      />
      <CancelMeetingDialog
        dateISO={cancelForDate}
        onClose={() => setCancelForDate(null)}
        onConfirm={handleCancelConfirm}
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
        "flex aspect-square min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg border text-base font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        // Finalized takes precedence over the avail/unavail styling so the
        // confirmed-meeting state is unmistakable in either view.
        isFinalized
          ? "border-blue-700 bg-blue-700 text-white hover:bg-blue-700/90"
          : isAvail
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
      <span>{cell.day}</span>
      {isFinalized && (
        <CalendarIcon className="h-3 w-3 opacity-90" aria-hidden="true" />
      )}
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
  meeting: MeetingDetails | null;
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
    meeting,
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
    // Finalized fill overrides the heatmap so the cell reads as "confirmed
    // meeting" regardless of how many members were available.
    isFinalized ? "bg-blue-700 text-white" : heat,
    isToday && !isFinalized && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
    isFinalized && "ring-2 ring-primary ring-offset-2 ring-offset-background"
  );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" className={cls} aria-label={label}>
          <span className="text-base font-semibold">{cell.day}</span>
          {isFinalized ? (
            <CalendarIcon className="h-3 w-3 opacity-90" aria-hidden="true" />
          ) : (
            <span className="text-[10px] font-medium opacity-90">{countText}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72 p-0">
        <GroupCellPopoverBody
          iso={cell.iso}
          availableNames={availableNames}
          memberStatuses={memberStatuses}
          isFinalized={isFinalized}
          meeting={meeting}
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
  meeting,
  isModerator,
  onAction,
}: {
  iso: string;
  availableNames: string[];
  memberStatuses: MemberStatus[];
  isFinalized: boolean;
  meeting: MeetingDetails | null;
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
              Meeting confirmed for this date,{" "}
              {meeting
                ? formatTimeRange(meeting.startTime, meeting.endTime)
                : "4:00–8:00 PM"}
            </p>
            {meeting?.location && (
              <p className="mt-0.5 text-muted-foreground">{meeting.location}</p>
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

function FinalizeMeetingDialog({
  dateISO,
  onClose,
  onSubmit,
}: {
  dateISO: string | null;
  onClose: () => void;
  onSubmit: (input: Omit<FinalizeMeetingInput, "date">) => void;
}) {
  const open = dateISO !== null;
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME);
  const [endTime, setEndTime] = useState(DEFAULT_END_TIME);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Each time the dialog opens for a new date, reset to defaults so the form
  // doesn't carry over stale entries from a prior cell.
  function handleOpenChange(next: boolean) {
    if (!next) {
      onClose();
      setStartTime(DEFAULT_START_TIME);
      setEndTime(DEFAULT_END_TIME);
      setLocation("");
      setNotes("");
      setError(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (toMinutes(endTime) <= toMinutes(startTime)) {
      setError("End time must be after start time.");
      return;
    }
    setError(null);
    onSubmit({
      startTime,
      endTime,
      location: location.trim() || null,
      notes: notes.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Finalize meeting</DialogTitle>
          <DialogDescription>
            All members will be emailed a calendar invite.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              {dateISO ? formatLongDate(dateISO) : ""}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="finalize-start">Start time</Label>
              <Input
                id="finalize-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="finalize-end">End time</Label>
              <Input
                id="finalize-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="finalize-location">Location (optional)</Label>
            <Input
              id="finalize-location"
              placeholder="e.g. Member home in Tucker's Town"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="finalize-notes">Notes (optional)</Label>
            <Textarea
              id="finalize-notes"
              placeholder="Anything members should know before the meeting"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Finalize and notify members</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CancelMeetingDialog({
  dateISO,
  onClose,
  onConfirm,
}: {
  dateISO: string | null;
  onClose: () => void;
  onConfirm: (reason: string | null) => void;
}) {
  const open = dateISO !== null;
  const longDate = dateISO ? formatLongDate(dateISO) : "";
  const [reason, setReason] = useState("");

  function handleOpenChange(next: boolean) {
    if (!next) {
      onClose();
      setReason("");
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel meeting on {longDate}?</AlertDialogTitle>
          <AlertDialogDescription>
            All members will be notified.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="cancel-reason">Reason for cancellation (optional)</Label>
          <Textarea
            id="cancel-reason"
            placeholder="Anything you want members to know"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => handleOpenChange(false)}>
            Keep
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              const trimmed = reason.trim();
              setReason("");
              onConfirm(trimmed || null);
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Cancel meeting
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function UpcomingMeetingsCard({
  meetings,
  todayISO,
  isModerator,
  onCancel,
}: {
  meetings: MeetingDetails[];
  todayISO: string;
  isModerator: boolean;
  onCancel: (iso: string) => void;
}) {
  const upcoming = meetings.filter((m) => m.date >= todayISO);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Upcoming meetings</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No meetings scheduled yet.
          </p>
        ) : (
          <ul className="-mx-2 divide-y divide-border">
            {upcoming.map((m) => (
              <li
                key={m.date}
                className="flex items-start justify-between gap-3 px-2 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug text-foreground">
                    {formatShortDate(m.date)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatTimeRange(m.startTime, m.endTime)}
                  </p>
                  {m.location && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {m.location}
                    </p>
                  )}
                </div>
                {isModerator && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onCancel(m.date)}
                    className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    Cancel
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// Converts a "HH:MM:SS" or "HH:MM" Postgres time literal to a friendly
// "4:00 PM" rendering. Anything we can't parse falls through as-is rather than
// erroring, so a malformed value at least prints something readable.
function formatTime(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return t;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const minutes = m.toString().padStart(2, "0");
  return `${hour12}:${minutes} ${period}`;
}

// "4:00 PM" → "4:00 PM" + en-dash + "8:00 PM", collapsing the AM/PM marker
// when both ends share it ("4:00–8:00 PM").
function formatTimeRange(startTime: string, endTime: string): string {
  const start = formatTime(startTime);
  const end = formatTime(endTime);
  const sParts = start.split(" ");
  const eParts = end.split(" ");
  if (sParts.length === 2 && eParts.length === 2 && sParts[1] === eParts[1]) {
    return `${sParts[0]}–${eParts[0]} ${eParts[1]}`;
  }
  return `${start}–${end}`;
}

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
