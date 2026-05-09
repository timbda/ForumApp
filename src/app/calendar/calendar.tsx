"use client";

import { useOptimistic, useState, useTransition } from "react";
import { markAvailable, markUnavailable } from "./actions";
import { finalizeMeeting, unfinalizeMeeting } from "./meeting-actions";
import { formatLocalISO } from "./dates";

type CalendarProps = {
  unavailableDates: string[];
  unavailabilityCounts: Record<string, number>;
  finalizedDates: string[];
  totalMembers: number;
  isModerator: boolean;
};

type Cell = { day: number; iso: string } | null;
type Month = { year: number; month: number; cells: Cell[] };

type View = "mine" | "group";
type UnavailAction = { date: string; mark: "unavailable" | "available" };
type FinalizedAction = { date: string; op: "add" | "remove" };
type Confirm = { date: string; action: "finalize" | "unfinalize" };

export function Calendar({
  unavailableDates,
  unavailabilityCounts,
  finalizedDates,
  totalMembers,
  isModerator,
}: CalendarProps) {
  const [view, setView] = useState<View>("mine");
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const [optimisticUnavail, applyUnavail] = useOptimistic<
    Set<string>,
    UnavailAction
  >(new Set(unavailableDates), (state, action) => {
    const next = new Set(state);
    if (action.mark === "unavailable") next.add(action.date);
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
    const isUnavail = optimisticUnavail.has(dateISO);
    startTransition(async () => {
      applyUnavail({
        date: dateISO,
        mark: isUnavail ? "available" : "unavailable",
      });
      try {
        if (isUnavail) await markAvailable(dateISO);
        else await markUnavailable(dateISO);
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
    <main className="min-h-screen bg-white pb-12">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">My Availability</h1>
          <a href="/" className="text-sm text-gray-600 hover:text-gray-900">
            Home
          </a>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Changes save automatically.
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
                    isUnavail: optimisticUnavail.has(iso),
                    isFinalized,
                    isToday,
                    isPast,
                    onClick: () => handleMineToggle(iso),
                  });
                }

                const unavailCount = unavailabilityCounts[iso] ?? 0;
                const availCount = Math.max(0, totalMembers - unavailCount);
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
    </main>
  );
}

function renderMineCell(args: {
  key: number;
  cell: { day: number; iso: string };
  isUnavail: boolean;
  isFinalized: boolean;
  isToday: boolean;
  isPast: boolean;
  onClick: () => void;
}) {
  const { key, cell, isUnavail, isFinalized, isToday, isPast, onClick } = args;
  const base =
    "flex aspect-square min-h-[44px] items-center justify-center rounded-lg border text-base font-medium transition-colors";
  let style: string;
  if (isUnavail) {
    style = "border-red-300 bg-red-100 text-red-700 line-through";
  } else if (isPast) {
    style = "border-gray-200 bg-white text-gray-400 hover:bg-gray-50";
  } else {
    style = "border-gray-200 bg-white text-gray-900 hover:bg-gray-50";
  }
  const ring = ringClass(isFinalized, isToday);
  return (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={`${base} ${style}${ring}`}
      aria-pressed={isUnavail}
      aria-label={`${cell.iso}${isUnavail ? " (unavailable)" : ""}${
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
