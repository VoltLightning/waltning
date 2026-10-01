import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode, toMoney } from "@waltning/core/money";
import { expect, it } from "vitest";
import type {
  PhoneContextRow,
  PhoneTransactionDetail,
} from "../create-phone-ledger/create-phone-ledger.ts";
import { readTransactionContext } from "./transaction-context.ts";

const SELF = id<"transactions">("55555555-5555-4555-8555-555555555555");
const OTHER = id<"transactions">("00000000-0000-4000-8000-000000000001");
const NINA = id<"counterparties">("33333333-3333-4333-8333-333333333333");

const subject: Pick<
  PhoneTransactionDetail,
  | "id"
  | "date"
  | "type"
  | "amount"
  | "currency"
  | "decimals"
  | "isCapital"
  | "counterpartyId"
  | "categoryId"
  | "accountId"
  | "toAccountId"
  | "isBusiness"
  | "lines"
> = {
  id: SELF,
  date: accountingDate("2026-03-12"),
  type: "expense",
  amount: toMoney("-48.90"),
  currency: currencyCode("PLN"),
  decimals: 2,
  isCapital: false,
  counterpartyId: NINA,
  categoryId: null,
  accountId: id<"accounts">("11111111-1111-4111-8111-111111111111"),
  toAccountId: null,
  isBusiness: false,
  lines: [],
};

/** S09: a counterparty picked here is a draft, so the rows read for it do not hold this one yet. */
it("counts this transaction in a counterparty's figures before it is saved under them", () => {
  const rows: PhoneContextRow[] = [
    {
      id: OTHER,
      date: accountingDate("2026-03-02"),
      amountOriginal: toMoney("10"),
      isCapital: false,
    },
  ];
  const [card] = readTransactionContext(
    { readContextRows: () => rows, readSpendByCategory: () => [] },
    subject,
  );
  if (card?.kind !== "who") throw new Error("expected a Who card");
  expect(card.count).toBe(2);
  expect(card.months.at(-1)?.total).toBe(toMoney("58.9"));
  expect(card.share).toBe(toMoney("48.90"));
});
