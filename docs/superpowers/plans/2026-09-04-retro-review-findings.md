# Retroactive adversarial review of `main` at 83080a8 — findings to fix (2026-09-04)

Six Opus reviews under the `adversarial-review` skill over the wave-4 merges (#102–#108, #111). Severities are the register's. Grouped into the PRs that fix them; each PR gets the same review loop (skill review → fix → focused re-review → gate).

## R1 · FX rates on the phone (E3, #102) — `packages/ledger/src/currencies`, `create-transaction.executor.ts`
- **C1** `set_manual_rate` overwrites the provider row (PK is `(base, quote, date)`); `clear_manual_rate` then leaves a hole the docblock says is impossible. Preserve the displaced `(rate, source, fetched_at)` or widen identity with precedence; test a set/clear cycle keeps NBP's figure.
- **C2** `initializeFromPinned` overrides a stored choice *during* hydration (guards `value`, ignores `hydrated`); later rounds rewired it (`readPivot`) — re-verify at HEAD and add the in-flight-hydrate test.
- **H1** `provisionalFxRate`'s `lastKnownRate` ignores the row's date and the carry cap; a future-dated manual rate re-prices every capture; a back-dated capture gets today's rate. `create_transaction` must call `readRate(pivot, quote, input.date)`; `setManualRateInput` refuses `to > today`.
- **H2** §7.6 "setting a rate by hand clears `fx_rate_estimated`" has no implementation; no `rerate_transactions` on the phone. Either re-rate in `set_manual_rate`'s transaction or amend §7.6.
- **H3** `readRate` walks back to the origin for `source`/`asOf` but returns the carried copy's `rate` — after a manual correction of the origin, the carried copy outranks it. Return `origin.rate`; `set_manual_rate` deletes descendant `carried_forward` rows.
- **H4** `margin` on a zero-amount transfer: Postgres `division_by_zero` takes the whole margins query down; the phone mints `"NaN"` as `Money`. CHECK `amount_original > 0 or type = 'adjustment'`, Zod to match, `margin` refuses zero.
- **M1** `readCrossRate` brands a to-per-from rate as `PivotPerUnit` (also E5 C1) — a `CrossRate` brand + `rate.type-test.ts` assertion.
- **M3** calendar-invalid dates (`2026-02-31`) accepted by `zAccountingDate`; refine at the rate-range inputs or globally.
- **M4** `change_pivot` stamps derived rows with the original `source`, drops `fetched_at`; add `derived` to `FX_SOURCE`.
- (M2 range cap and M5 coverage were fixed in #109's rounds — re-verify at HEAD.)

## R2 · Counterparties and settlement (E2, #103) — `packages/ledger/src/counterparties`, outbox
- **C1** SQLite `lower()` is ASCII-only: `ŁUKASZ`/`łukasz` both land on the phone, Postgres refuses at drain. Fold in JS (`toLocaleLowerCase` + `fold`) into a stored `name_folded` column indexed on both engines.
- **H1** `unmerge` repoints moved rows without checking they still point at the winner — a later deliberate reassignment is overwritten. Add `eq(counterpartyId, winnerId)`; count misses as skipped.
- **H2** chained merges (A→B, B→C) reverse into the wrong owner; refuse a merge whose ids appear on an open merge.
- **H3** `settle_debt` passes `input.currency` through; a row can contradict its account's currency (§6.5) and drift the balance; Postgres refuses at drain. Read the account's currency and refuse (beside `assertBusinessNotShared`).
- **H4** the settlement's `type` (income/expense) is derived from the live balance at apply time and not carried; no dependency edge to the debt rows in the outbox → the server can apply it first. Carry `type` on the payload and verify; or add the dependency.
- **H5** `merge_counterparties` recomputes `movedTransactionIds` at apply time; server and phone can move different sets. Put the moved ids on the payload.
- **H6** a refusal thrown from `apply` strands a drainable outbox entry that the next write's watermark buries — inherited from `write.ts`, multiplied by six new refusing executors. Pre-check refusals before the outbox commit, or mark the entry `blocked(terminal)` at the throw.
- **M1** merge leaves `recurring_transactions.counterparty_id` on the loser; distinct pairs are not transitive across a merge. **M2** migration `0007` lacks `winner <> loser` CHECK and a partial unique index on open merges. **M3** an archived loser keeps its name under the total unique index. **M4** no index on `transactions.counterparty_id` in the replica; three full scans per settlement.

## R3 · Debt figures (E1, #105) — `money.ts`, readers, SQL twins
- **C1** `find_unsettled` (SQL) omits `opening_balance`; the phone includes it; both fixtures use 0. Add it to the CTE with a left join; a non-zero opening on a clearing fixture.
- **H2** the phone FIFO also ignores opening; a clearing account with an opening balance names an outflow as "oldest unconsumed", or `null` on the "cannot happen" branch. Seed a synthetic opening delta, or a CHECK that `kind = 'clearing'` ⇒ `opening_balance = 0`.
- **H3** the Today banner joins the account's balance to one leg's payee; `fifoOldestOpen` should return the remainder and the banner show it (or drop the payee when remainder ≠ balance).
- **H4** `allocateLargestRemainder` destroys or invents value on an off-scale total (`0.4` two ways at 0 dp → 0/0). Throw when `total` is not integral at scale.
- **M1** archived clearing accounts invisible on the phone, reported by the server. **M2** `computations.md` §8's sentence is not sign-symmetric; both engines open on the first sign seen. **M3** `SPEC.md` §6.6's `counterparty_balances` view lacks `side` and the `debt_*` coalesces — update the spec. **M4** O(accounts × legs) scans per refresh. **L** `decimals ?? 2` for a missing currency; negative ages; `debtAmount ?? amountOriginal` fallback vs SQL's `to_amount`; no CHECK pairing `debt_currency`/`debt_amount` in the replica.

## R4 · Quick add and J02 (D4b/D5, #104/#106)
- **H1** a proposed category is rendered as a filled chip but never enters the draft — Save writes `category_id NULL` while the screen says *Eating out*. Commit the proposal into the draft with the P2 trail + Undo, or never render it as filled.
- **H2** fraction digits beyond the account's `decimals` survive an account switch (`48,90` then a 0-dp account) and are stored; the row renders `49`. Refine `createTransactionInput` against the currency scale + a Postgres CHECK/trigger.
- **H3** `provisionalFxRate` stamps today's rate on a back-dated row with `fx_rate_estimated = false` (same as R1 H1).
- **M1** Save enabled on `"48,"` and `"0,"` (Zod refuses) — `parseAmount` returns null on a trailing separator. **M2** a backwards clock reopens the four-hour window (`now − at < 0`). **M3** the §14.6 ordering test cannot fail on ordering; needs the crash-window test. **M4** `MACHINE_BUDGET_MS` is dead: RTL's 1 s `waitFor` gates first; locale-coupled assertion. **L** no P2 Undo/trail; two ambers on one screen (§8 P4 vs `Chip` machine tint); `"Costa"` in the harness is a real chain — invent a name; `now` per render.

## R5 · Settle and transfer (E5, #108)
- **C1** `readCrossRate` brand (= R1 M1). **C2** a letter in the fee field crashes the transfer screen (`toMoney` on raw text in render) — parse with `parseAmount`.
- **H1** the destination amount survives a destination-currency change (138 EUR saved as 138 PLN; same-currency hides the field with the stale figure). Reset `toAmountRaw` on account change.
- **H2** the fee's currency is unstated: the composer treats it as destination, the schema has no `fee_currency`, readers key it off the source. Decide in `SPEC.md` §7.5, add `fee_currency` or a CHECK, render the currency beside the field.
- **H3** a zero destination amount is accepted end to end (`to_amount >= 0`); `isZero` in `saveDisabled`, `> 0` refine, tighten the CHECK.
- **M1** the synthetic pivot leg wins the "worse" pick → reference line says `· pivot ·` with the wrong date. **M2** realized rate renders `0,0000` offline with no reference — derive it from the two amounts unconditionally. **L** `SPEC.md` §7.5's example says 6.29 PLN, exact is 6.30; `RateField` editable mode hands the formatted string back; mixed-provenance label.

## R6 · Restored C6 and polish (#107/#111)
- **C1** `UndoToast`: the 8 s timer is never cancelled by `exit()` and `exit` is re-entrant — an Undo at 7.9 s is cancelled by the expiry (`finished=false`), `onUndo` never fires; under reduced motion a double tap fires it twice (a second inverse write). `exiting` ref + timer cancel; fake-timer tests.
- **H1** the 8 s window is not re-armed between two toasts with the same message; key by an incrementing token.
- **H2** `readCategoryUsage` diverges from §6: a transaction with only null-category lines counts for its header category. Derive `hasLines` from a separate distinct-ids read.
- **M1** two legal root "Uncategorized" nodes (leaf + group) — one becomes unreachable; match the seeded id. **M2** `readCategoryReferenceCounts` in the render body, three unindexed scans per keystroke.

## Held everywhere: the §6.6 four-event table, the §7.5 worked example, the FIFO queue ≡ SQL closed form (200k fuzz), the allocation examples, the slider arithmetic, the #107 restore (complete, byte-identical; #101's S16 intact).
