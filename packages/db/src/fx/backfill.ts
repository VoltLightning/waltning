/**
 * FX backfill. Fetches every configured currency against the USD pivot for a
 * date range and upserts into `fx_rates`.
 *
 * Two rules it must not break:
 *   - A manual override outranks a synced rate and is never overwritten (§7.6).
 *   - A carried-forward day is marked as such, so it is never mistaken for a
 *     quoted figure.
 *
 * Usage:  pnpm db:fx [from] [to]
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { and, eq, sql } from "drizzle-orm";
import { createDb } from "../client.ts";
import { currencies, fxRates } from "../schema.ts";
import { fillForward, sources } from "./sources.ts";

const rootEnv = fileURLToPath(new URL("../../../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const db = createDb();

/** First transaction in the source data. */
const DEFAULT_FROM = "2020-11-25";

async function main() {
  const from = process.argv[2] ?? DEFAULT_FROM;
  const to = process.argv[3] ?? new Date().toISOString().slice(0, 10);

  const pivotRow = await db
    .select({ code: currencies.code })
    .from(currencies)
    .where(eq(currencies.isPivot, true))
    .limit(1);
  const pivot = pivotRow[0]?.code;
  if (!pivot) throw new Error("no pivot currency — run the seed first");

  const targets = await db
    .select({ code: currencies.code, source: currencies.rateSource })
    .from(currencies)
    .where(and(eq(currencies.archived, false), sql`${currencies.isPivot} = false`));

  console.log(`backfilling ${from} → ${to}, pivot ${pivot}\n`);

  let grandTotal = 0;
  for (const t of targets) {
    if (!t.source) {
      console.log(`  ${t.code.padEnd(4)} — no rate source configured, skipped`);
      continue;
    }
    const fetchFn = sources[t.source];
    if (!fetchFn) {
      console.log(`  ${t.code.padEnd(4)} — unknown source "${t.source}", skipped`);
      continue;
    }

    process.stdout.write(`  ${t.code.padEnd(4)} via ${t.source.padEnd(5)} `);
    let quoted;
    try {
      quoted = await fetchFn(t.code, from, to);
    } catch (e) {
      console.log(`FAILED — ${(e as Error).message}`);
      continue;
    }

    const filled = fillForward(quoted, from, to);
    let written = 0;
    const BATCH = 500;

    for (let i = 0; i < filled.length; i += BATCH) {
      const slice = filled.slice(i, i + BATCH);
      await db
        .insert(fxRates)
        .values(
          slice.map((r) => ({
            base: pivot,
            quote: t.code,
            date: r.date,
            rate: r.rate,
            source: (r.carried ? "carried_forward" : t.source) as
              | "nbp" | "ecb" | "nbrb" | "nbg" | "carried_forward",
            fetchedAt: new Date(),
          })),
        )
        // A manual override is never clobbered by a later sync.
        .onConflictDoUpdate({
          target: [fxRates.base, fxRates.quote, fxRates.date],
          set: { rate: sql`excluded.rate`, source: sql`excluded.source`, fetchedAt: sql`excluded.fetched_at` },
          setWhere: sql`${fxRates.source} <> 'manual'`,
        });
      written += slice.length;
    }

    const carried = filled.filter((r) => r.carried).length;
    grandTotal += written;
    console.log(
      `${String(written).padStart(5)} days  (${quoted.length} quoted, ${carried} carried forward)`,
    );
  }

  console.log(`\n  ${grandTotal.toLocaleString()} rate-days stored`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
