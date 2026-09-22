/**
 * **What follows a figure: the pivot's symbol, every other currency's code**
 * (`design-system/04` §4.1). `1 240,50 zł`, but `62,40 BYN`.
 *
 * The pivot is the currency nearly every figure is in, so its symbol is the one
 * a reader knows without reading; a foreign balance is rarer and is exactly
 * where a symbol misleads — `Br`, `₾` and `zł` are three unfamiliar marks to
 * someone who holds all three, and `$` does not say which dollar.
 *
 * **Decided once, here, for every `<Amount>`.** Callers pass the currency's
 * code, as they always have; the provider at the app's root knows the pivot,
 * and the figure draws its mark. Without a provider — a story, a test — the
 * code is drawn as given.
 */

import { createContext, type ReactNode, useContext, useMemo } from "react";

type Marks = { pivot: string; symbol: string } | null;

const CurrencyMarks = createContext<Marks>(null);

export function CurrencyMarksProvider({
  pivot,
  symbol,
  children,
}: {
  /** The pivot's code, or `undefined` before one exists. */
  pivot: string | undefined;
  symbol: string | undefined;
  children: ReactNode;
}) {
  const value = useMemo(
    () =>
      pivot === undefined || symbol === undefined || symbol.trim() === ""
        ? null
        : { pivot, symbol },
    [pivot, symbol],
  );
  return <CurrencyMarks.Provider value={value}>{children}</CurrencyMarks.Provider>;
}

/**
 * The mark as text, for a figure drawn outside `<Amount>` — a typed amount's
 * affix. A component so it can sit inside a `Text` a condition decides on.
 */
export function CurrencyMark({ code }: { code: string }) {
  return <>{useCurrencyMark(code)}</>;
}

/** The mark drawn after a figure in `currency` — its symbol if it is the pivot. */
export function useCurrencyMark(currency: string): string {
  const marks = useContext(CurrencyMarks);
  return marks !== null && currency === marks.pivot ? marks.symbol : currency;
}
