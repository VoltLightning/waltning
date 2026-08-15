/**
 * The carry cap. A weekend gap must fill; a dead source must not.
 */
import { fillForward } from "../sources.ts";

const quotes = [
  { date: "2022-02-28", rate: "100" },
  { date: "2022-03-01", rate: "105" }, // last real quote, as with RUB
];
const filled = fillForward(quotes, "2022-02-28", "2026-08-05");
const carried = filled.filter((r) => r.carried);

console.log(`  days written     ${filled.length}   (uncapped would be 1621)`);
console.log(`  carried          ${carried.length}   (cap is 10)`);
console.log(`  last date        ${filled.at(-1)!.date}`);

const weekend = fillForward(
  [
    { date: "2020-11-27", rate: "3.7614" },
    { date: "2020-11-30", rate: "3.7364" },
  ],
  "2020-11-27",
  "2020-11-30",
);
const ok =
  carried.length === 10 &&
  filled.length === 12 &&
  weekend.length === 4 &&
  weekend[1]!.carried &&
  weekend[2]!.carried &&
  !weekend[3]!.carried;
console.log(`  weekend still fills: ${weekend.map((w) => (w.carried ? "c" : "q")).join("")}`);
console.log(`\n  ${ok ? "PASS — weekend fills, dead source stops" : "FAIL"}`);
if (!ok) process.exit(1);
