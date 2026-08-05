/**
 * Regression check for the DST bug: local-time date arithmetic combined with
 * UTC formatting repeats a date in spring and skips one in autumn. It only
 * surfaces on ranges long enough to contain a transition, which is why an
 * 11-day test passed and the 5-year run failed on a duplicate key.
 */
import { fillForward } from "../sources.ts";

const from = "2020-11-25";
const to = "2026-08-04";
// Carry is uncapped here on purpose: this checks date iteration, not carry
// policy, and the default cap would truncate the range under test.
const filled = fillForward([{ date: from, rate: "1" }], from, to, Infinity);
const dates = filled.map((r) => r.date);
const uniq = new Set(dates);
const expected =
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000,
  ) + 1;

let gaps = 0;
for (let i = 1; i < dates.length; i++) {
  const step =
    (Date.parse(`${dates[i]}T00:00:00Z`) -
      Date.parse(`${dates[i - 1]}T00:00:00Z`)) /
    86400000;
  if (step !== 1) gaps++;
}

const ok = dates.length === expected && uniq.size === dates.length && gaps === 0;
console.log(
  `  ${(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "?").padEnd(20)}` +
    `generated ${dates.length}  expected ${expected}  unique ${uniq.size}  ` +
    `bad-steps ${gaps}  ${ok ? "PASS" : "FAIL"}`,
);
if (!ok) process.exit(1);
