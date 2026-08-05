/**
 * Reference-rate adapters. Each is a function from (currency, date range) to
 * rates quoted against the USD pivot (§7.7).
 *
 * All four endpoints were verified to serve 2020-11-25, the first date in the
 * data, and all quote directly against USD — so no primary pair needs
 * triangulation and nothing falls back to a stale snapshot.
 *
 * Convention throughout: `rate` is how many units of the currency one USD buys.
 * NBP and NBRB publish exactly that. NBG publishes per-quantity and is
 * normalized here.
 */

export type DailyRate = {
  date: string; // YYYY-MM-DD
  /** Units of `currency` per 1 USD. */
  rate: string;
};

export type FetchFn = (
  currency: string,
  from: string,
  to: string,
) => Promise<DailyRate[]>;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** NBP caps a single request at 367 days, so ranges are chunked. */
async function* chunkRanges(from: string, to: string, days: number) {
  let start = new Date(from);
  const end = new Date(to);
  while (start <= end) {
    const stop = new Date(start);
    stop.setDate(stop.getDate() + days - 1);
    yield [isoDay(start), isoDay(stop > end ? end : stop)] as const;
    start = new Date(stop);
    start.setDate(start.getDate() + 1);
  }
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (res.status === 404) return null; // NBP returns 404 for empty ranges
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

/** Narodowy Bank Polski — the rates Polish tax filing uses. PLN per USD. */
export const nbp: FetchFn = async (_currency, from, to) => {
  const out: DailyRate[] = [];
  for await (const [a, b] of chunkRanges(from, to, 360)) {
    const j = (await getJson(
      `https://api.nbp.pl/api/exchangerates/rates/a/USD/${a}/${b}/?format=json`,
    )) as { rates?: { effectiveDate: string; mid: number }[] } | null;
    for (const r of j?.rates ?? []) {
      out.push({ date: r.effectiveDate, rate: String(r.mid) });
    }
  }
  return out;
};

/** National Bank of the Republic of Belarus. BYN per USD, one day per call. */
export const nbrb: FetchFn = async (_currency, from, to) => {
  const out: DailyRate[] = [];
  for (const d of eachDay(from, to)) {
    const j = (await getJson(
      `https://api.nbrb.by/exrates/rates/USD?parammode=2&ondate=${d}`,
    )) as { Cur_OfficialRate?: number; Cur_Scale?: number } | null;
    if (j?.Cur_OfficialRate != null) {
      const scale = j.Cur_Scale ?? 1;
      out.push({ date: d, rate: String(j.Cur_OfficialRate / scale) });
    }
  }
  return out;
};

/** National Bank of Georgia. GEL per USD, normalized by `quantity`. */
export const nbg: FetchFn = async (_currency, from, to) => {
  const out: DailyRate[] = [];
  for (const d of eachDay(from, to)) {
    const j = (await getJson(
      `https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/en/json/?currencies=USD&date=${d}`,
    )) as { currencies?: { rate: number; quantity: number }[] }[] | null;
    const c = j?.[0]?.currencies?.[0];
    if (c) out.push({ date: d, rate: String(c.rate / (c.quantity || 1)) });
  }
  return out;
};

/**
 * ECB via the Frankfurter mirror of the daily reference series. Returns the
 * currency per USD directly by asking for USD as the base.
 */
export const ecb: FetchFn = async (currency, from, to) => {
  const j = (await getJson(
    `https://api.frankfurter.dev/v1/${from}..${to}?base=USD&symbols=${currency}`,
  )) as { rates?: Record<string, Record<string, number>> } | null;
  const out: DailyRate[] = [];
  for (const [date, byCcy] of Object.entries(j?.rates ?? {})) {
    const v = byCcy[currency];
    if (v != null) out.push({ date, rate: String(v) });
  }
  return out;
};

export const sources: Record<string, FetchFn> = { nbp, nbrb, nbg, ecb };

function* eachDay(from: string, to: string) {
  const end = new Date(to);
  for (let d = new Date(from); d <= end; d.setDate(d.getDate() + 1)) {
    yield isoDay(d);
  }
}

/**
 * Weekends and holidays have no published rate. Carrying the last one forward
 * is the standard convention and what NBP itself does — and it is marked as
 * such, so a carried figure is never mistaken for a quoted one.
 */
export function fillForward(
  rates: DailyRate[],
  from: string,
  to: string,
): { date: string; rate: string; carried: boolean }[] {
  const byDate = new Map(rates.map((r) => [r.date, r.rate]));
  const out: { date: string; rate: string; carried: boolean }[] = [];
  let last: string | null = null;
  for (const d of eachDay(from, to)) {
    const quoted = byDate.get(d);
    if (quoted != null) {
      last = quoted;
      out.push({ date: d, rate: quoted, carried: false });
    } else if (last != null) {
      out.push({ date: d, rate: last, carried: true });
    }
    // Before the first quote there is nothing to carry — skipped, not invented.
  }
  return out;
}
