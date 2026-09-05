/**
 * `useLedgerFilters` — S10's filter state, shared by both surfaces' own
 * layout of it: the phone's chip row and sheet (`apps/mobile/src/
 * ledger-screen.tsx`), and the desk table's rail (§3 web: "the filter bar as
 * a persistent left rail rather than a chip row"). One state, two furnitures
 * around it — the same split `DeskBand`/`TabBar` already draw for the shell.
 *
 * **Plain strings in, a typed draft out.** `filter.scope` is a real
 * `PhoneTransactionScope` (a `SegmentControl` never offers a fifth value),
 * but `from`/`to` stay bare strings — a `DateField` mid-edit is not yet a
 * real date, and `create-phone-ledger.ts`'s own `searchTransactions` already
 * drops an unparseable one from the query rather than throwing. `draft` is
 * exactly the shape `useTransactionSearch` wants, memoised so its `filterKey`
 * (`JSON.stringify`) only changes when a value actually did.
 *
 * **Every dimension §4 names lives here, not only the ones the phone sheet
 * draws.** `currency` and `counterpartyId` are the desk rail's own two extra
 * controls (S10 §4: "account · category · scope · currency · date range ·
 * counterparty"); the phone sheet simply does not render them yet. Filing
 * them anywhere else would make the desk rail's state a second filter object
 * beside this one, which is exactly the divergence H5 was.
 *
 * **`clearAll` forgets a filter that arrived from another screen.** S10 §2:
 * a filter carried in from S25 or S12 seeds the initial state, but "Clear
 * all" is the reader's own decision to see everything — it resets to the
 * same empty shape every other screen starts from, not back to what arrived.
 */

import { useCallback, useMemo, useState } from "react";
import type { PhoneTransactionScope, TransactionFilterDraft } from "./create-phone-ledger.ts";

export type LedgerFilterState = {
  text: string;
  accountIds: readonly string[];
  categoryIds: readonly string[];
  scope: PhoneTransactionScope;
  /** `""` — every currency. A bare code otherwise. */
  currency: string;
  /** `""` — every counterparty. */
  counterpartyId: string;
  from: string;
  to: string;
};

export const EMPTY_LEDGER_FILTER: LedgerFilterState = {
  text: "",
  accountIds: [],
  categoryIds: [],
  scope: "all",
  currency: "",
  counterpartyId: "",
  from: "",
  to: "",
};

export type UseLedgerFiltersResult = {
  filter: LedgerFilterState;
  /** `filter`, reshaped for `useTransactionSearch` — memoised on `filter` alone. */
  draft: TransactionFilterDraft;
  hasActiveFilter: boolean;
  setText: (value: string) => void;
  setAccountIds: (ids: readonly string[]) => void;
  setCategoryIds: (ids: readonly string[]) => void;
  setScope: (scope: PhoneTransactionScope) => void;
  setCurrency: (code: string) => void;
  setCounterpartyId: (id: string) => void;
  setFrom: (value: string) => void;
  setTo: (value: string) => void;
  /** Both ends in one update — the desk rail's period stepper never wants a half-set range on screen. */
  setRange: (from: string, to: string) => void;
  removeAccount: (id: string) => void;
  removeCategory: (id: string) => void;
  removeScope: () => void;
  removeDateRange: () => void;
  clearAll: () => void;
};

export function useLedgerFilters(initial?: Partial<LedgerFilterState>): UseLedgerFiltersResult {
  const [filter, setFilter] = useState<LedgerFilterState>(() => ({
    ...EMPTY_LEDGER_FILTER,
    ...initial,
  }));

  const setText = useCallback((value: string) => {
    setFilter((current) => ({ ...current, text: value }));
  }, []);
  const setAccountIds = useCallback((ids: readonly string[]) => {
    setFilter((current) => ({ ...current, accountIds: ids }));
  }, []);
  const setCategoryIds = useCallback((ids: readonly string[]) => {
    setFilter((current) => ({ ...current, categoryIds: ids }));
  }, []);
  const setScope = useCallback((scope: PhoneTransactionScope) => {
    setFilter((current) => ({ ...current, scope }));
  }, []);
  const setCurrency = useCallback((code: string) => {
    setFilter((current) => ({ ...current, currency: code }));
  }, []);
  const setCounterpartyId = useCallback((counterpartyId: string) => {
    setFilter((current) => ({ ...current, counterpartyId }));
  }, []);
  const setFrom = useCallback((value: string) => {
    setFilter((current) => ({ ...current, from: value }));
  }, []);
  const setTo = useCallback((value: string) => {
    setFilter((current) => ({ ...current, to: value }));
  }, []);
  const setRange = useCallback((from: string, to: string) => {
    setFilter((current) => ({ ...current, from, to }));
  }, []);
  const removeAccount = useCallback((id: string) => {
    setFilter((current) => ({
      ...current,
      accountIds: current.accountIds.filter((existing) => existing !== id),
    }));
  }, []);
  const removeCategory = useCallback((id: string) => {
    setFilter((current) => ({
      ...current,
      categoryIds: current.categoryIds.filter((existing) => existing !== id),
    }));
  }, []);
  const removeScope = useCallback(() => {
    setFilter((current) => ({ ...current, scope: "all" }));
  }, []);
  const removeDateRange = useCallback(() => {
    setFilter((current) => ({ ...current, from: "", to: "" }));
  }, []);
  const clearAll = useCallback(() => setFilter(EMPTY_LEDGER_FILTER), []);

  const draft = useMemo<TransactionFilterDraft>(
    () => ({
      text: filter.text,
      accountIds: filter.accountIds,
      categoryIds: filter.categoryIds,
      scope: filter.scope,
      currency: filter.currency,
      ...(filter.counterpartyId === "" ? {} : { counterpartyId: filter.counterpartyId }),
      from: filter.from,
      to: filter.to,
    }),
    [filter],
  );

  const hasActiveFilter =
    filter.accountIds.length > 0 ||
    filter.categoryIds.length > 0 ||
    filter.scope !== "all" ||
    filter.currency !== "" ||
    filter.counterpartyId !== "" ||
    filter.from !== "" ||
    filter.to !== "";

  return {
    filter,
    draft,
    hasActiveFilter,
    setText,
    setAccountIds,
    setCategoryIds,
    setScope,
    setCurrency,
    setCounterpartyId,
    setFrom,
    setTo,
    setRange,
    removeAccount,
    removeCategory,
    removeScope,
    removeDateRange,
    clearAll,
  };
}
