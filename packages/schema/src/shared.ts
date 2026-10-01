/**
 * The shared set, named once.
 *
 * `architecture/14` §14.7 fixes which tables exist on both engines. Naming them
 * in a type rather than a comment means `pg.ts` and `sqlite.ts` can be checked
 * against the list instead of against each other's good intentions — a table
 * added to one module and not the other fails here, before the row types are
 * even compared.
 */
/**
 * What `merge_counterparties` did to one of the loser's opening debts (§6.6),
 * kept on the merge record so `unmerge_counterparties` can reverse it exactly.
 * `moved` — the winner had none in that currency, so the row changed owner.
 * `combined` — it had, so the two were summed into the winner's row (the
 * loser's row is soft-deleted, `winnerBefore` is what the winner's held, and
 * `relinked` the repayments that were pointed at the winner's row). `cancelled`
 * — the two summed to nothing and both rows were soft-deleted. `after` is the
 * winner's row right after the merge: unmerge restores only a row that still
 * holds it, so a correction made since is never overwritten.
 */
export type MovedOpeningDebt =
  | { readonly mode: "moved"; readonly id: string }
  | {
      readonly mode: "combined" | "cancelled";
      readonly id: string;
      readonly into: string;
      readonly winnerBefore: {
        readonly direction: "theyOwe" | "youOwe";
        readonly amount: string;
        readonly date: string;
      };
      /** Every repayment whose link the merge changed, with the link it had and the one it was given. */
      readonly links: readonly {
        readonly id: string;
        readonly was: string | null;
        readonly now: string | null;
      }[];
      readonly after: {
        readonly direction: "theyOwe" | "youOwe";
        readonly amount: string;
        readonly date: string;
        readonly deleted: boolean;
      };
    };

export type SharedTable =
  | "accountGroups"
  | "accounts"
  | "brandAliases"
  | "categories"
  | "counterparties"
  | "counterpartyDistinctPairs"
  | "counterpartyMerges"
  | "currencies"
  | "dashboardLayouts"
  | "dashboardWidgets"
  | "fxRates"
  | "openingDebts"
  | "recurringTransactions"
  | "tags"
  | "transactionLines"
  | "transactionTags"
  | "transactions";
