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
 * whitespace, so any `,` or `.` found is always the decimal mark). The second
 * alternative is a bare fraction with no integer part — `,5` → `0.5` — which
 * S05's own examples include.
 *
 * C1: the leading run is `\d+`, not `\d{1,3}` \u2014 that cap silently dropped
 * every digit past the third in an ungrouped amount (`1234.56` matched only
 * `123`, and the rest never reached `unmatched` because it sat inside the
 * amount token's own span). A grouped form still wins: `\d+` only ever
 * consumes a contiguous digit run, so a real space still ends it and a
 * correctly-grouped `1 234.56` matches exactly as before.
 */
const NUMBER = /\d+(?:[ \u00a0]\d{3})*(?:[.,]\d+)?|[.,]\d+/g;

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

    const amount = toMoney(toDecimalString(raw));
    const { currency, span: currencySpan } = findCurrencyToken(text, end);
    return { amount, currency, span: [start, end], currencySpan };
  }
  return null;
}
