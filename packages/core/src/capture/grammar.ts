/**
 * `parseCapture` — D1's deterministic capture grammar.
 *
 * Amount first (`amount.ts`), then account, category and date bind by name
 * or pattern, and whatever text is left over is the payee. No model, no
 * fuzzy match (tier 1.5 is D2 — `docs/superpowers/plans/2026-09-03-d1-capture-grammar.md`
 * names it explicitly). When the shape does not resolve, the reason says
 * which piece is missing, so the screen can offer *interpret with model*
 * instead of silently spending 2–5s (`screens/S05-quick-add.md` §3).
 */

import type { AccountingDate } from "../date.ts";
import type { Money } from "../money.ts";
import { findAmount } from "./amount.ts";
import { findDate } from "./dates.ts";
import { findName, fold } from "./names.ts";

export type CaptureContext = {
  accounts: readonly {
    id: string;
    name: string;
    currency: string;
    aliases?: readonly string[];
  }[];
  categories: readonly { id: string; name: string }[];
  defaultAccountId: string | null;
  today: AccountingDate;
  locale: "en" | "pl";
};

/** The fields resolved so far, carried on a failed parse so the screen can pre-fill what it can. */
type CapturedFields = {
  amount?: Money;
  accountId?: string;
  categoryId?: string | null;
  date?: AccountingDate;
};

export type CaptureParse =
  | {
      ok: true;
      amount: Money;
      accountId: string;
      categoryId: string | null;
      date: AccountingDate;
      payee: string;
      unmatched: readonly string[];
    }
  | {
      ok: false;
      reason: "no_amount" | "no_account" | "currency_mismatch" | "too_much_unmatched";
      partial: CapturedFields;
      unmatched: readonly string[];
    };

/**
 * PLN's `zł` symbol, the one currency symbol S05's own examples use
 * (`money.ts`'s file comment draws the same figure). Only entry in scope for
 * D1 — a symbol table, not a currency converter: it exists so the grammar can
 * compare what someone typed against `CaptureContext.accounts[].currency`,
 * never to convert an amount.
 */
const CURRENCY_SYMBOLS: Record<string, string> = { zl: "PLN" };

function normalizeCurrency(token: string): string {
  const folded = fold(token);
  return (CURRENCY_SYMBOLS[folded] ?? token).toUpperCase();
}

function overlaps(a: readonly [number, number], b: readonly [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

type Token = { text: string; span: [number, number] };

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\S+/g;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: the idiomatic `exec` loop.
  while ((m = pattern.exec(text))) {
    tokens.push({ text: m[0], span: [m.index, m.index + m[0].length] });
  }
  return tokens;
}

function remainingTokens(
  tokens: readonly Token[],
  consumed: readonly [number, number][],
): string[] {
  return tokens.filter((t) => !consumed.some((c) => overlaps(c, t.span))).map((t) => t.text);
}

/** Strip leading/trailing punctuation from the joined payee — letters and digits stay, in any language. */
const PUNCTUATION_EDGES = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

export function parseCapture(text: string, context: CaptureContext): CaptureParse {
  const tokens = tokenize(text);

  const amountToken = findAmount(text);
  if (amountToken === null) {
    return {
      ok: false,
      reason: "no_amount",
      partial: {},
      unmatched: tokens.map((t) => t.text),
    };
  }

  const consumed: [number, number][] = [amountToken.span];
  if (amountToken.currencySpan) consumed.push(amountToken.currencySpan);

  const accountMatch = findName(text, context.accounts, consumed);
  if (accountMatch) consumed.push(accountMatch.span);
  const accountId = accountMatch?.value.id ?? context.defaultAccountId;

  if (accountId === null) {
    return {
      ok: false,
      reason: "no_account",
      partial: { amount: amountToken.amount },
      unmatched: remainingTokens(tokens, consumed),
    };
  }

  if (amountToken.currency !== null) {
    const account = context.accounts.find((a) => a.id === accountId);
    if (account && normalizeCurrency(amountToken.currency) !== account.currency.toUpperCase()) {
      return {
        ok: false,
        reason: "currency_mismatch",
        partial: { amount: amountToken.amount, accountId },
        unmatched: remainingTokens(tokens, consumed),
      };
    }
  }

  const categoryMatch = findName(text, context.categories, consumed);
  if (categoryMatch) consumed.push(categoryMatch.span);
  const categoryId = categoryMatch?.value.id ?? null;

  let date = context.today;
  const dateMatch = findDate(text, context.today, context.locale);
  // A date-shaped token can sit inside a span already claimed (an amount that
  // happens to contain a dot, say). The earlier claim wins; the text is not
  // read a second time as something else.
  if (dateMatch && !consumed.some((c) => overlaps(c, dateMatch.span))) {
    date = dateMatch.date;
    consumed.push(dateMatch.span);
  }

  const remaining = remainingTokens(tokens, consumed);
  const payee = remaining.join(" ").replace(PUNCTUATION_EDGES, "");

  // "unmatched tokens > 6 or > 60% of tokens and the payee would be empty" —
  // Task 4's literal threshold.
  const tooMuchUnmatched =
    remaining.length > 6 || (remaining.length / tokens.length > 0.6 && payee === "");

  if (tooMuchUnmatched) {
    return {
      ok: false,
      reason: "too_much_unmatched",
      partial: { amount: amountToken.amount, accountId, categoryId, date },
      unmatched: remaining,
    };
  }

  return {
    ok: true,
    amount: amountToken.amount,
    accountId,
    categoryId,
    date,
    payee,
    unmatched: remaining,
  };
}
