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

export type FetchFn = (currency: string, from: string, to: string) => Promise<DailyRate[]>;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * A central bank publishes its own currency against USD and nothing else. The
 * adapter signature takes a currency because ECB is genuinely multi-currency;
 * the others must refuse rather than return a rate for the wrong one.
 */
function assertServes(source: string, currency: string, serves: string): void {
  if (currency !== serves) {
    throw new Error(
      `${source} publishes ${serves} only — it cannot serve ${currency}. ` +
        `Set currencies.rate_source for ${currency} to 'ecb' (SPEC.md §7.7).`,
    );
  }
}

/**
 * All date arithmetic is UTC. Using the local-time setters (`setDate`) while
 * formatting with `toISOString` silently breaks across DST: a local "+1 day" is
 * 23 or 25 real hours, so the UTC date repeats in spring and skips in autumn.
 * That produced duplicate keys in a single insert batch, and only showed up on
 * ranges long enough to contain a transition.
 */
const addDaysUTC = (d: Date, n: number) => {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
};

/** NBP caps a single request at 367 days, so ranges are chunked. */
async function* chunkRanges(from: string, to: string, days: number) {
  let start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (start <= end) {
    const stop = addDaysUTC(start, days - 1);
    yield [isoDay(start), isoDay(stop > end ? end : stop)] as const;
    start = addDaysUTC(stop, 1);
  }
}

/**
 * Retried with backoff. NBRB and NBG publish one day per call, so a full
 * backfill is ~2,000 sequential requests per currency — at that volume a
 * transient failure is close to certain, and losing the whole run to one
 * dropped connection is not acceptable.
 */
async function getJson(url: string, attempt = 0): Promise<unknown> {
  const MAX = 4;
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 404) return null; // NBP returns 404 for empty ranges
    // NBG answers a self-redirect once its bot defence trips — retrying is
    // futile and the honest report is "rate-limited", not "fetch failed".
    if (res.redirected || (res.status >= 300 && res.status < 400)) {
      throw new Error(`rate-limited (redirect loop) — back off and retry later: ${url}`);
    }
    if (res.status === 429 || res.status >= 500) {
      throw new Error(`${res.status} ${res.statusText}`);
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
    return await res.json();
  } catch (e) {
    if (attempt >= MAX) throw e;
    await new Promise((r) => setTimeout(r, 2 ** attempt * 400));
    return getJson(url, attempt + 1);
  }
}

/**
 * Narodowy Bank Polski — the rates Polish tax filing uses. PLN per USD.
 *
 * Serves PLN and nothing else. §7.7 lists NBP as a permitted source for RUB;
 * configuring that would have fetched PLN-per-USD and stored it as the RUB
 * rate — valuing a 50 000 RUB expense at $13 313 instead of $685, silently,
 * with source = 'nbp' and no estimate flag. Assert rather than serve garbage.
 */
export const nbp: FetchFn = async (currency, from, to) => {
  assertServes("nbp", currency, "PLN");
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
export const nbrb: FetchFn = async (currency, from, to) => {
  assertServes("nbrb", currency, "BYN");
  const out: DailyRate[] = [];
  for (const d of eachDay(from, to)) {
    const j = (await getJson(`https://api.nbrb.by/exrates/rates/USD?parammode=2&ondate=${d}`)) as {
      Cur_OfficialRate?: number;
      Cur_Scale?: number;
    } | null;
    if (j?.Cur_OfficialRate != null) {
      const scale = j.Cur_Scale ?? 1;
      out.push({ date: d, rate: String(j.Cur_OfficialRate / scale) });
    }
  }
  return out;
};

/** National Bank of Georgia. GEL per USD, normalized by `quantity`. */
export const nbg: FetchFn = async (currency, from, to) => {
  assertServes("nbg", currency, "GEL");
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
  const end = new Date(`${to}T00:00:00Z`);
  let d = new Date(`${from}T00:00:00Z`);
  while (d <= end) {
    yield isoDay(d);
    d = addDaysUTC(d, 1);
  }
}

/**
 * Weekends and holidays have no published rate. Carrying the last one forward
 * is the standard convention and what NBP itself does — and it is marked as
 * such, so a carried figure is never mistaken for a quoted one.
 *
 * But carrying is bounded. When ECB delisted RUB in March 2022 the naive fill
 * produced 1,754 consecutive days holding a single 2022 figure, presented
 * exactly like a weekend gap. A four-year carry is not a gap, it is a dead
 * source — and §7.6 says surface the failure rather than carry silently.
 *
 * Beyond MAX_CARRY_DAYS nothing is written, so the rate is visibly absent
 * rather than confidently wrong.
 */
export const MAX_CARRY_DAYS = 10;

export function fillForward(
  rates: DailyRate[],
  from: string,
  to: string,
  maxCarry = MAX_CARRY_DAYS,
): { date: string; rate: string; carried: boolean }[] {
  const byDate = new Map(rates.map((r) => [r.date, r.rate]));
  const out: { date: string; rate: string; carried: boolean }[] = [];
  let last: string | null = null;
  let carriedFor = 0;
  for (const d of eachDay(from, to)) {
    const quoted = byDate.get(d);
    if (quoted != null) {
      last = quoted;
      carriedFor = 0;
      out.push({ date: d, rate: quoted, carried: false });
    } else if (last != null && carriedFor < maxCarry) {
      carriedFor++;
      out.push({ date: d, rate: last, carried: true });
    }
    // Before the first quote, or past the carry limit: skipped, not invented.
  }
  return out;
}
