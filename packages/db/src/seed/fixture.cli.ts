/**
 * `pnpm --filter @waltning/db fixture` — the runnable half of `fixture.ts`.
 *
 * Three lines in their own file so that module stays importable without side
 * effects: `fixture.test.ts` reads its account list, and a test that seeds a
 * database merely by importing one is not a test.
 */

import { apply, drop, monthsRequested, today } from "./fixture.ts";

if (process.argv.includes("--drop")) await drop();
else await apply(today, monthsRequested(process.argv));
process.exit(0);
