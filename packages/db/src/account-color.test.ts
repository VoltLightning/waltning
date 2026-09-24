/**
 * `ACCOUNT_COLOR` is stated twice — in `@waltning/schema`, where the CHECK
 * `accounts_color_known` is built from it, and in `@waltning/core`, where
 * `update_account` validates against it — because neither package can import
 * the other. This is where the two meet: a colour the input accepts and the
 * CHECK refuses is a write the phone reports as saved and the server rejects
 * at drain, days later, with no field to attach the refusal to.
 */

import { ACCOUNT_COLOR as inputColors } from "@waltning/core/registry/inputs";
import { ACCOUNT_COLOR as columnColors } from "@waltning/schema/enums";
import { expect, it } from "vitest";

it("accepts in the input exactly the colours the column's CHECK allows", () => {
  expect([...inputColors]).toEqual([...columnColors]);
});
