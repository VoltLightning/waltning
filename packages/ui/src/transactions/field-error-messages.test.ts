/**
 * `resolveFieldErrorMessage` — the point at which a refusal produced by
 * `packages/client` (which cannot call `useT()`) becomes a sentence.
 *
 * Driven through `defaultI18n` rather than a rendered tree: the function takes
 * its `t` as a parameter, so there is nothing to mount, and a Polish assertion
 * is `getFixedT("pl")` instead of a provider.
 */

import { describe, expect, it } from "vitest";
import { defaultI18n } from "../i18n/provider";
import { resolveFieldErrorMessage } from "./field-error-messages.ts";

const en = defaultI18n.getFixedT("en");
const pl = defaultI18n.getFixedT("pl");

describe("resolveFieldErrorMessage", () => {
  it("falls back to the raw message when there is no key to resolve", () => {
    expect(resolveFieldErrorMessage(en, { message: "something the catalogue never named" })).toBe(
      "something the catalogue never named",
    );
  });

  /**
   * L-b — `zAccountingDate`'s calendar refusal reaches here as a key rather
   * than as Zod's English literal (`transport/field-errors.ts` is what tags
   * it), because the command bar's input is free text and `2026-02-31` is a
   * line a person will actually send.
   */
  it("says a bad date in the reader's own language, not Zod's English", () => {
    const error = { message: "not a real calendar date", messageKey: "transactions.badDate" };
    expect(resolveFieldErrorMessage(en, error)).toBe("That date isn't a real calendar day.");
    expect(resolveFieldErrorMessage(pl, error)).toBe("To nie jest prawdziwy dzień kalendarzowy.");
    // The English literal is what a reader would otherwise have been shown.
    expect(resolveFieldErrorMessage(pl, error)).not.toBe(error.message);
  });

  it("still resolves the keys that were already here — the date is an addition, not a replacement", () => {
    expect(
      resolveFieldErrorMessage(en, {
        message: "raw",
        messageKey: "transactions.tooManyDecimals",
        params: { currency: "PLN", decimals: "2" },
      }),
    ).toBe("PLN holds 2 decimal places — this amount has more.");
    expect(
      resolveFieldErrorMessage(en, {
        message: "raw",
        messageKey: "transactions.categoryUnavailable",
      }),
    ).toBe("This category is no longer available.");
  });
});
