"use client";

import { useOptimistic, useState, useTransition } from "react";
import { markAvailable, markUnavailable } from "./actions";
import { finalizeMeeting, unfinalizeMeeting } from "./meeting-actions";
import { formatLocalISO } from "./dates";

type MemberStatus = { name: string; last_reviewed_at: string | null };

type CalendarProps = {
  availableDates: string[];
  availabilityCounts: Record<string, number>;
  finalizedDates: string[];
  totalMembers: number;
  isModerator: boolean;
  reviewedRecentlyCount: number;
  memberStatuses: MemberStatus[];
};

type Cell = { day: number; iso: string } | null;
type Month = { year: number; month: number; cells: Cell[] };

type View = "mine" | "group";
type AvailAction = { date: string; mark: "available" | "unavailable" };
type FinalizedAction = { date: string; op: "add" | "remove" };
type Confirm = { date: string; action: "finalize" | "unfinalize" };

export function Calendar({
  availableDates,
  availabilityCounts,
  finalizedDates,
  totalMembers,
  isModerator,
  reviewedRecentlyCount,
  memberStatuses,
}: CalendarProps) {
  const [view, setView] = useState<View>("mine");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [bannerExpanded, setBannerExpanded] = useState(false);

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
      }
    });
  }

  function handleGroupTap(dateISO: string) {
    if (!isModerator) return;
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
        if (c.action === "finalize") await finalizeMeeting(c.date);
        else await unfinalizeMeeting(c.date);
      } catch (err) {
        console.error("Meeting action failed:", err);
      }
    });
  }

  return (
    <div>
      <header className="-mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pb-3 border-b border-gray-200 bg-white">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">My Availability</h1>
        <p className="mt-1 text-xs text-gray-500">
          Changes save automatically.
        </p>
        <p className="mt-1 text-xs text-gray-500">
          All dates start as unavailable. Tap a date to mark yourself available.
        </p>
        <div className="mt-3 flex rounded-lg border border-gray-300 p-0.5">
          <button
            type="button"
            onClick={() => setView("mine")}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              view === "mine"
                ? "bg-gray-900 text-white"
                : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            My availability
          </button>
          <button
            type="button"
            onClick={() => setView("group")}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              view === "group"
                ? "bg-gray-900 text-white"
                : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            Group availability
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-md px-3">
        {view === "group" && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setBannerExpanded((v) => !v)}
              aria-expanded={bannerExpanded}
              className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-left text-sm font-medium text-blue-900 hover:bg-blue-100 active:bg-blue-100"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  {reviewedRecentlyCount} of {totalMembers} members reviewed
                  availability in the last 30 days
                </span>
                {!bannerExpanded && (
                  <span className="mt-0.5 block text-xs font-normal text-blue-700">
                    Tap to see who has and hasn&apos;t reviewed
                  </span>
                )}
              </span>
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-base text-blue-700"
              >
                {bannerExpanded ? "▲" : "▼"}
              </span>
            </button>
            {bannerExpanded && (
              <ul className="mt-2 divide-y divide-gray-200 rounded-lg border border-gray-200">
                {memberStatuses.map((m, idx) => {
                  const status = reviewedStatusIcon(m.last_reviewed_at);
                  return (
                    <li
                      key={`${m.name}-${idx}`}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <span className="truncate text-gray-900">{m.name}</span>
                      <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-gray-600">
                        {status && (
                          <span
                            aria-hidden="true"
                            className={`inline-block w-3 text-center ${status.cls}`}
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
            )}
          </div>
        )}
        {months.map((m) => (
          <section key={`${m.year}-${m.month}`} className="mt-6">
            <h2 className="px-1 text-base font-semibold text-gray-900">
              {monthLabel(m.year, m.month)}
            </h2>
            <div className="mt-2 grid grid-cols-4 gap-1 text-center text-xs font-medium text-gray-500">
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
            </div>
            <div className="mt-1 grid grid-cols-4 gap-1">
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
                return renderGroupCell({
                  key: i,
                  cell,
                  availCount,
                  totalMembers,
                  isFinalized,
                  isToday,
                  interactive: isModerator,
                  onClick: isModerator ? () => handleGroupTap(iso) : undefined,
                });
              })}
            </div>
          </section>
        ))}
      </div>

      {confirm && (
        <ConfirmDialog
          confirm={confirm}
          onCancel={() => setConfirm(null)}
          onConfirm={handleConfirmYes}
        />
      )}
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
  const base =
    "flex aspect-square min-h-[44px] items-center justify-center rounded-lg border text-base font-medium transition-colors";
  const style = isAvail
    ? "border-green-400 bg-green-100 text-green-800 hover:bg-green-50"
    : "border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-50";
  const past = isPast ? " opacity-60" : "";
  const ring = ringClass(isFinalized, isToday);
  return (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={`${base} ${style}${past}${ring}`}
      aria-pressed={isAvail}
      aria-label={`${cell.iso}${isAvail ? " (available)" : " (unavailable)"}${
        isFinalized ? " (finalized meeting)" : ""
      }`}
    >
      {cell.day}
    </button>
  );
}

function renderGroupCell(args: {
  key: number;
  cell: { day: number; iso: string };
  availCount: number;
  totalMembers: number;
  isFinalized: boolean;
  isToday: boolean;
  interactive: boolean;
  onClick?: () => void;
}) {
  const {
    key,
    cell,
    availCount,
    totalMembers,
    isFinalized,
    isToday,
    interactive,
    onClick,
  } = args;
  const base =
    "flex aspect-square min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg border border-transparent leading-none";
  const heat = heatmapClasses(availCount, totalMembers);
  const ring = ringClass(isFinalized, isToday);
  const label = `${cell.iso}: ${availCount} of ${totalMembers} available${
    isFinalized ? " (finalized meeting)" : ""
  }`;
  const countText =
    totalMembers > 0 ? `${availCount}/${totalMembers}` : String(availCount);

  const content = (
    <>
      <span className="text-base font-semibold">{cell.day}</span>
      <span className="text-[10px] font-medium opacity-90">{countText}</span>
    </>
  );

  if (interactive) {
    return (
      <button
        key={key}
        type="button"
        onClick={onClick}
        className={`${base} ${heat}${ring} hover:opacity-90`}
        aria-label={label}
      >
        {content}
      </button>
    );
  }
  return (
    <div key={key} className={`${base} ${heat}${ring}`} aria-label={label}>
      {content}
    </div>
  );
}

function ringClass(isFinalized: boolean, isToday: boolean): string {
  if (isFinalized) return " ring-4 ring-blue-500";
  if (isToday) return " ring-2 ring-gray-900";
  return "";
}

function heatmapClasses(available: number, total: number): string {
  if (total <= 0) return "bg-gray-100 text-gray-500";
  const pct = available / total;
  if (pct >= 1) return "bg-green-700 text-white";
  if (pct >= 0.75) return "bg-green-300 text-gray-900";
  if (pct >= 0.5) return "bg-yellow-200 text-gray-900";
  if (pct >= 0.25) return "bg-orange-400 text-white";
  return "bg-red-700 text-white";
}

function ConfirmDialog({
  confirm,
  onCancel,
  onConfirm,
}: {
  confirm: Confirm;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isFinalize = confirm.action === "finalize";
  const longDate = formatLongDate(confirm.date);
  const title = isFinalize
    ? `Finalize meeting on ${longDate}?`
    : `Cancel meeting on ${longDate}?`;
  const yesLabel = isFinalize ? "Finalize" : "Cancel meeting";
  const noLabel = isFinalize ? "Cancel" : "Keep";
  const yesStyle = isFinalize
    ? "bg-blue-600 text-white hover:bg-blue-700"
    : "bg-red-600 text-white hover:bg-red-700";

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-base font-medium text-gray-900">{title}</p>
        <p className="mt-1 text-sm text-gray-600">
          All members will be notified.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
          >
            {noLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 rounded-lg px-4 py-2 font-medium ${yesStyle}`}
          >
            {yesLabel}
          </button>
        </div>
      </div>
    </div>
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
  if (iso === null) return { icon: "⊘", cls: "text-gray-400" };
  const reviewedAt = new Date(iso).getTime();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  if (Date.now() - reviewedAt <= thirtyDaysMs) {
    return { icon: "✓", cls: "text-green-600" };
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
