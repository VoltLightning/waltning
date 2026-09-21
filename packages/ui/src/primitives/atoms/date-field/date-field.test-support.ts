/**
 * Setting a date the way a person now does — for tests, and only for tests.
 *
 * **Why this exists.** On a phone `DateField` is a button that opens the drum;
 * there is nothing to type into. Two dozen tests used to set a date with
 * `fireEvent.change` on its input, which was never what a thumb did and is now
 * not possible. `pickDate` opens the field, presses the year, the month and
 * the day on the drum (rows are pressable — `wheel.tsx`), and confirms.
 *
 * **Year, then month, then day**, because the drum clamps: pressing the 31st
 * and then February lands on the 28th, and a helper that did it in the other
 * order would set a date nobody asked for.
 *
 * The typed field is the *desk's*: a test that wants it resizes the window
 * itself, inline, the way `use-breakpoint.test.tsx` does — this file names no
 * browser global, because nothing under `src/` may.
 */

import { fireEvent, screen, within } from "@testing-library/react";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function pressRow(column: string, name: string): void {
  // The last one mounted: a stack keeps the screens underneath, and a screen
  // below may have a control of its own called *Year*.
  const drums = screen.getAllByLabelText(column);
  const drum = drums[drums.length - 1];
  if (drum === undefined) throw new Error(`no ${column} drum is open`);
  const row = within(drum).queryByRole("button", { name });
  if (row === null) {
    throw new Error(
      `the ${column} drum does not offer "${name}" — the year column runs eight back ` +
        "and one forward of the field's own value; set a nearer date first, or use the desk's typed field",
    );
  }
  fireEvent.click(row);
}

/** With the drum already open — a composer's row opens it directly — set `iso` and confirm. */
export function chooseOnDrum(iso: string): void {
  const [year, month, day] = iso.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`a date is YYYY-MM-DD, got ${iso}`);
  }
  pressRow("Year", String(year));
  pressRow("Month", MONTHS[month - 1] ?? "");
  pressRow("Day", String(day));
  fireEvent.click(screen.getByText("Use this date"));
}

/** Open the date field called `label` and set it to `iso` (`YYYY-MM-DD`), in English. */
export function pickDate(label: string, iso: string): void {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}: `) }));
  chooseOnDrum(iso);
}

/**
 * What the field called `label` says when it holds `iso` — its accessible name.
 * The field speaks in words (*Today*, *March 4, 2026*), so a test that knows
 * an ISO date asks for the name rather than spelling the format itself.
 */
export function dateFieldName(label: string, iso: string, today?: string): string {
  if (today !== undefined && iso === today) return `${label}: Today`;
  if (today !== undefined) {
    const [ty, tm, td] = today.split("-").map(Number);
    const before = new Date(Date.UTC(ty ?? 0, (tm ?? 1) - 1, (td ?? 1) - 1))
      .toISOString()
      .slice(0, 10);
    if (iso === before) return `${label}: Yesterday`;
  }
  const [year, month, day] = iso.split("-").map(Number);
  const words = new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)));
  return `${label}: ${words}`;
}
