"use client";

import { useOptimistic, useTransition } from "react";
import { markAvailable, markUnavailable } from "./actions";
import { formatLocalISO } from "./dates";

type CalendarProps = { unavailableDates: string[] };

type Cell = { day: number; iso: string } | null;
type Month = { year: number; month: number; cells: Cell[] };

type OptimisticAction = { date: string; mark: "unavailable" | "available" };

export function Calendar({ unavailableDates }: CalendarProps) {
  const baseSet = new Set(unavailableDates);
  const [optimistic, applyOptimistic] = useOptimistic<Set<string>, OptimisticAction>(
    baseSet,
    (state, action) => {
      const next = new Set(state);
      if (action.mark === "unavailable") next.add(action.date);
      else next.delete(action.date);
      return next;
    }
  );
  const [, startTransition] = useTransition();

  const today = new Date();
  const todayISO = formatLocalISO(today);
  const months = generateMonths(today, 12);

  function handleToggle(dateISO: string) {
    const isUnavail = optimistic.has(dateISO);
    startTransition(async () => {
      applyOptimistic({
        date: dateISO,
        mark: isUnavail ? "available" : "unavailable",
      });
      try {
        if (isUnavail) {
          await markAvailable(dateISO);
        } else {
          await markUnavailable(dateISO);
        }
      } catch (err) {
        console.error("Toggle failed:", err);
      }
    });
  }

  return (
    <main className="min-h-screen bg-white pb-12">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">My Availability</h1>
          <a
            href="/"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Home
          </a>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Changes save automatically.
        </p>
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
                const isUnavail = optimistic.has(iso);
                const isPast = iso < todayISO;
                const isToday = iso === todayISO;

                const base =
                  "flex aspect-square min-h-[44px] items-center justify-center rounded-lg border text-base font-medium transition-colors";
                let style: string;
                if (isUnavail) {
                  style = "border-red-300 bg-red-100 text-red-700 line-through";
                } else if (isPast) {
                  style =
                    "border-gray-200 bg-white text-gray-400 hover:bg-gray-50";
                } else {
                  style =
                    "border-gray-200 bg-white text-gray-900 hover:bg-gray-50";
                }
                const ring = isToday ? " ring-2 ring-gray-900" : "";

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleToggle(iso)}
                    className={`${base} ${style}${ring}`}
                    aria-pressed={isUnavail}
                    aria-label={`${iso}${isUnavail ? " (unavailable)" : ""}`}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
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
