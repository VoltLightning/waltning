/**
 * **The section order, and the census that keeps it total.**
 *
 * `AccountRegister` builds its sections by mapping `KIND_ORDER`, not by
 * grouping the rows it was handed — so a kind absent from that list renders
 * nowhere. Not as an empty section, not as an error: the accounts simply do
 * not appear, while the hero total above them still counts their money. A
 * register that is quietly missing an account is worse than one that draws it
 * in the wrong place, and nothing else in the file can catch it, because the
 * list compiles perfectly well when it is short.
 *
 * So this asserts against `ACCOUNT_KIND` itself. A tenth kind fails here until
 * someone decides where it belongs — the same shape `kind-tint.ts` already
 * gives the colour ramp, one property over.
 */

import { ACCOUNT_KIND } from "@waltning/core/registry/inputs";
import { describe, expect, it } from "vitest";
import { KIND_ORDER } from "./account-register";
import { POPULATED } from "./account-register.stories";

describe("the register's section order", () => {
  it("places every account kind", () => {
    const missing = ACCOUNT_KIND.filter((kind) => !KIND_ORDER.includes(kind));
    expect(missing, "kinds the register would render nowhere").toEqual([]);
  });

  it("names no kind twice, and none that does not exist", () => {
    expect(new Set(KIND_ORDER).size, "a duplicated kind draws its accounts twice").toBe(
      KIND_ORDER.length,
    );
    const unknown = KIND_ORDER.filter((kind) => !ACCOUNT_KIND.includes(kind));
    expect(unknown, "kinds the schema does not have").toEqual([]);
  });

  /**
   * S16 §3 — the places money is held come first, what is owed comes last. A
   * register read top to bottom answers *what do I have* before it answers
   * *what of this is not really mine*, and a loan section in the middle
   * interrupts the first question to start the second.
   */
  it("ends with the two loan kinds, owed-to-you before owed-by-you", () => {
    expect(KIND_ORDER.slice(-2)).toEqual(["loan_receivable", "loan_payable"]);
  });

  it("opens on the kinds that hold spendable money", () => {
    expect(KIND_ORDER.slice(0, 3)).toEqual(["bank", "cash", "card"]);
  });

  /**
   * **And the story has to draw all of them**, or the visual suite's
   * screenshots prove the ramp for whichever kinds happened to be in the
   * fixture. Four were missing — both loans, `investment` and `other` — so
   * four of the nine colours in `accountKindRamp` had never been rendered
   * against a row, and a contrast defect in any of them could ship.
   */
  it("is drawn in full by the register's own story fixture", () => {
    const drawn = new Set(POPULATED.map((account) => account.kind));
    const missing = KIND_ORDER.filter((kind) => !drawn.has(kind));
    expect(missing, "kinds no screenshot covers").toEqual([]);
  });
});
