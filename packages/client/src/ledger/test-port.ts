/**
 * `basePort()` — every `PhoneLedgerPort` method, defaulted to the emptiest
 * honest answer.
 *
 * **M4 — one fixture, not one hand-rolled literal per screen test.** Before
 * this file, a full `PhoneLedgerPort` was retyped from scratch at each call
 * site — `create-phone-ledger.test.ts` and a dozen `apps/mobile` screen
 * tests each carried their own copy, so a new required port method (this
 * file's own reason to exist: `getAuditLog`, H3) meant editing every one of
 * them by hand rather than one shared default. A test overrides only the
 * methods it is actually about.
 */

import { toMoney } from "@waltning/core/money";
import type { PhoneLedgerPort, PhoneSearchPage } from "./create-phone-ledger.ts";

const EMPTY_SEARCH_PAGE: PhoneSearchPage = {
  rows: [],
  nextCursor: undefined,
  total: { count: 0, currencies: [] },
};

export function basePort(overrides: Partial<PhoneLedgerPort> = {}): PhoneLedgerPort {
  return {
    listAccounts: () => [],
    listCurrencies: () => [],
    listCurrencySettings: () => [],
    listGroups: () => [],
    listRecent: () => [],
    listCategories: () => [],
    listCategoryTree: () => [],
    listCounterparties: () => [],
    listPayeeHistory: () => [],
    listCounterpartyBalances: () => [],
    listFullCategoryTree: () => [],
    listCategoryUsage: () => new Map(),
    readCategoryReferenceCounts: () => ({ transactions: 0, lines: 0, rules: 0 }),
    listCounterpartyMerges: () => [],
    listDistinctCounterpartyPairs: () => [],
    listNetWorth: () => [],
    readPeriodSpend: () => [],
    readSpendByCategory: () => [],
    readIncomeVsExpense: () => [],
    readActiveDashboardLayout: () => null,
    listUnsettledClearing: () => [],
    balanceAsOf: () => toMoney("0"),
    searchTransactions: () => EMPTY_SEARCH_PAGE,
    createAccount: () => undefined,
    createTransaction: () => undefined,
    createCategory: () => undefined,
    categorizeBatch: () => undefined,
    getTransaction: () => null,
    getAuditLog: () => ({ status: "unavailable_on_device" }),
    updateTransaction: () => undefined,
    deleteTransaction: () => undefined,
    setTransactionLines: () => undefined,
    updateAccount: () => undefined,
    archiveAccount: () => undefined,
    reconcileAccount: () => undefined,
    createGroup: () => undefined,
    readRate: () => null,
    readCrossRate: () => null,
    readCoverage: () => [],
    listFxRates: () => [],
    addCurrency: () => undefined,
    archiveCurrency: () => undefined,
    setRateSource: () => undefined,
    setPinned: () => undefined,
    changePivot: () => ({ droppedDates: 0 }),
    setManualRate: () => ({ written: 0, replacedManual: 0 }),
    clearManualRate: () => ({ deleted: 0 }),
    updateCurrency: () => undefined,
    createCounterparty: () => undefined,
    updateCounterparty: () => undefined,
    mergeCounterparties: () => undefined,
    unmergeCounterparties: () => undefined,
    recordDistinctCounterparties: () => undefined,
    settleDebt: () => ({ residual: toMoney("0"), overSettled: false }),
    renameCategory: () => undefined,
    reparentCategory: () => undefined,
    convertLeafGroup: () => undefined,
    mergeCategories: () => undefined,
    archiveCategory: () => undefined,
    reset: () => undefined,
    ...overrides,
  };
}
