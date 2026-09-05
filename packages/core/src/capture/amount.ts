/**
 * The amount grammar: the FIRST number in the text, plus an optional currency
 * token immediately after it.
 *
 * The grammar's rule (`docs/specification/screens/S05-quick-add.md` §3, amount
 * 1): the first number found is the amount — `"2 coffees 18"` binds to `2`,
 * not `18`. That is a known, surprising cost of a grammar with no concept of
 * "which number looks like a price" (tier 1.5 — D2 — is where a model or a
 * heuristic could do better); tier 1 stays deterministic and visibly wrong
 * rather than silently guessing which number the person meant.
 *
 * Money never becomes a JS number on the way through — the matched text is
 * parsed straight into `Money` via `money.toMoney`.
 */

import { type Money, toMoney } from "../money.ts";
import { isoDateSpans } from "./dates.ts";

export type AmountToken = {
  amount: Money;
  currency: string | null;
  span: [number, number];
  /**
   * The currency token's own span, when one was found.
   *
   * Not in the plan's literal `AmountToken` shape — added because
   * `grammar.ts` has to exclude the currency word from the payee the same way
   * it excludes the amount itself, and it cannot do that without knowing
   * where the currency token sits in the original text.
   */
  currencySpan: [number, number] | null;
};

/**
 * Digits, an optional decimal fraction, and thousands grouped by a plain or
 * no-break space (never a comma — the grammar's one thousands separator is
 * whitespace, so any `,` or `.` found is always the decimal mark). The last
 * alternative is a bare fraction with no integer part — `,5` → `0.5` — which
 * S05's own examples include.
 *
 * **A grouping chain starts from a 1–3 digit head, and only from one** (L1).
 * C1's fix made the leading run `\d+` so an ungrouped `1234.56` would stop
 * losing its fourth digit — but `\d+(?:[ ]\d{3})*` then reads *any* digit run
 * followed by a space and three digits as one grouped figure, so `1234 567
 * cash` became `1234567`: two numbers a person typed, silently welded into an
 * amount a thousand times either of them. No real thousands separator ever
 * follows a four-digit head, so the chain alternative caps its head at three
 * and requires at least one group; an ungrouped run falls to the second
 * alternative, which consumes a contiguous digit run and stops at the space.
 *
 * `1 234.56` still matches whole (the chain wins, the decimal group is shared
 * by both alternatives), `1234.56` matches whole, and `1234 567` matches
 * `1234` — leaving `567` where the reader can see it, as payee text and in
 * `unmatched`, rather than inside the amount's own span.
 *
 * **The first number is the amount; every later one is payee text.** That is
 * S05 §3's stated rule, applied unchanged to a second *number* rather than a
 * second thousands group: `1000 2000 cash` saves 1000 with payee `2000`. The
 * grammar has no concept of which number looks like a price (the file doc
 * above), so refusing the line would refuse `2 coffees 18` too.
 */
const NUMBER = /(?:\d{1,3}(?:[ \u00a0]\d{3})+|\d+)(?:[.,]\d+)?|[.,]\d+/g;

/**
 * A currency token: one to three letters (covers `usd`, `pln`, `zł`) or a
 * common symbol, immediately after the amount. Deliberately short — `cash` is
 * four letters and must never be read as a currency, it is an account name.
 */
const CURRENCY_TOKEN = /^[\p{L}$€£¥]{1,3}$/u;

/** The matched grammar (space grouping, comma-or-dot decimal) into the plain numeric string `Decimal` accepts. */
function toDecimalString(matched: string): string {
  return matched.replace(/[ \u00a0]/g, "").replace(",", ".");
}

function findCurrencyToken(
  text: string,
  from: number,
): { currency: string | null; span: [number, number] | null } {
  const rest = text.slice(from);
  const tokenMatch = /^[ \u00a0]*(\S+)/.exec(rest);
  if (tokenMatch === null) {
    return { currency: null, span: null };
  }
  const token = tokenMatch[1];
  if (token === undefined || !CURRENCY_TOKEN.test(token)) {
    return { currency: null, span: null };
  }
  const leading = tokenMatch[0];
  const tokenStart = from + leading.length - token.length;
  return { currency: token, span: [tokenStart, tokenStart + token.length] };
}

export function findAmount(text: string): AmountToken | null {
  // L2 — computed once, before the scan: a `YYYY-MM-DD` token is a date this
  // grammar already knows how to read, and its year is not an amount. Every
  // *shaped* token, real day or not (`isoDateSpans`' own doc) — `2026-02-31`
  // is not a date, and its leading `2026` is still not money.
  const dateSpans = isoDateSpans(text);

  NUMBER.lastIndex = 0;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: the idiomatic `exec` loop.
  while ((match = NUMBER.exec(text))) {
    const start = match.index;
    const raw = match[0];
    const end = start + raw.length;

    // "-18" is refused outright (`"negative is not a capture"`, Task 1) —
    // skip past it and keep scanning rather than reading off the minus sign.
    if (start > 0 && text[start - 1] === "-") continue;

    // L2 — inside an ISO date. `findDate` claims the whole token later (or
    // `grammar.ts` refuses the line as `no_date`, for a shaped token that
    // names no real day); the year, month and day inside it are never the
    // money on the line.
    if (dateSpans.some(({ span: [from, to] }) => start < to && from < end)) continue;

    const amount = toMoney(toDecimalString(raw));
    const { currency, span: currencySpan } = findCurrencyToken(text, end);
    return { amount, currency, span: [start, end], currencySpan };
  }
  return null;
}
