export function formatLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// A single Mon–Thu cell, or null for an empty grid slot (Fri/Sat/Sun are not
// rendered, so a week's row is padded with nulls to keep the 4-column layout).
export type Cell = { day: number; iso: string } | null;
export type Month = { year: number; month: number; cells: Cell[] };

export function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

// Builds `count` months starting from `start`'s month, each laid out as a flat
// list of 4-wide rows (Mon–Thu only). Shared by the member's own "My
// availability" view and the moderator's edit-on-behalf view so both grids stay
// identical.
export function generateMonths(start: Date, count: number): Month[] {
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
