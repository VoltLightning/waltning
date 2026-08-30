/**
 * The currencies this ledger knows about, as reference data.
 *
 * **One list, two consumers.** The server seeds `currencies` from it and the
 * phone bootstraps its replica from the same rows. It lived in
 * `packages/db/src/seed/data.ts` while the server was the only thing that
 * needed it, which made the phone's single hardcoded `USD` row the only
 * currency a phone-alone ledger could hold — not a decision anyone took, just
 * the shape of where the list happened to sit.
 *
 * **`packages/core`, because a currency's `decimals` is arithmetic.** `money.ts`
 * rounds to it and `<Amount>` renders to it, so a wrong value is a wrong figure
 * rather than a cosmetic slip. That puts it on the floor both surfaces stand on,
 * beside the module that does the rounding.
 *
 * It is reference data, **not** the source of truth. The table is: someone can
 * add a currency, archive one, or change a symbol, and the row wins from that
 * moment. This list is only what a database holds before anyone has touched it.
 */

import { type CurrencyCode, currencyCode } from "./money.ts";

/**
 * `rateSource` is the published series this currency's rate is fetched from,
 * and `null` means nothing fetches it — true of the pivot, which is quoted
 * against itself, and of any currency a person adds by hand.
 *
 * The phone stores the column and never reads it: fetching rates needs a
 * network and a rate table, neither of which exists in the phone-alone build.
 * It travels anyway because dropping a field for the surface that ignores it is
 * how two definitions of one row start.
 */
export type CurrencyDefinition = {
  code: CurrencyCode;
  name: string;
  symbol: string;
  symbolPosition: "P" | "S";
  decimals: number;
  isPivot?: boolean;
  pinned?: boolean;
  rateSource: "nbp" | "ecb" | "nbrb" | "nbg" | null;
};

/**
 * USD is the pivot: every rate source in use publishes against it, and it is
 * what the imported history already stores, so migration needs no conversion
 * (§7.0). Pinned currencies appear in the header display toggle.
 *
 * **The pivot is not a display currency and not a default.** It is the technical
 * hub rates are quoted against, chosen once and never surfaced. An account in
 * this list's first row is in no way more normal than an account in its fourth.
 */
export const currencies: readonly CurrencyDefinition[] = [
  {
    code: currencyCode("USD"),
    name: "US Dollar",
    symbol: "$",
    symbolPosition: "P",
    decimals: 2,
    isPivot: true,
    pinned: true,
    rateSource: null,
  },
  {
    code: currencyCode("PLN"),
    name: "Polish Złoty",
    symbol: "zł",
    symbolPosition: "S",
    decimals: 2,
    pinned: true,
    rateSource: "nbp",
  },
  {
    code: currencyCode("EUR"),
    name: "Euro",
    symbol: "€",
    symbolPosition: "S",
    decimals: 2,
    pinned: true,
    rateSource: "ecb",
  },
  {
    code: currencyCode("BYN"),
    name: "Belarusian Ruble",
    symbol: "Br",
    symbolPosition: "S",
    decimals: 2,
    pinned: true,
    rateSource: "nbrb",
  },
  {
    code: currencyCode("GEL"),
    name: "Georgian Lari",
    symbol: "₾",
    symbolPosition: "S",
    decimals: 2,
    rateSource: "nbg",
  },
  {
    code: currencyCode("GBP"),
    name: "Pound Sterling",
    symbol: "£",
    symbolPosition: "P",
    decimals: 2,
    rateSource: "ecb",
  },
  {
    code: currencyCode("RUB"),
    name: "Russian Ruble",
    symbol: "₽",
    symbolPosition: "S",
    decimals: 2,
    rateSource: "ecb",
  },
];

/** The pivot, found rather than assumed to be first. */
export const pivotCurrency: CurrencyDefinition = (() => {
  const pivot = currencies.find((currency) => currency.isPivot);
  if (!pivot) throw new Error("the reference currencies declare no pivot");
  return pivot;
})();
