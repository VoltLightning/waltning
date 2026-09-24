/**
 * `useTransactionContext` — S09's context cards (`computations.md` §6a),
 * memoised on the transaction and invalidated by the snapshot revision, the
 * same shape `useCategoryPace` keeps. The reads are `readTransactionContext`,
 * beside this file, so they are testable without rendering.
 */

import { useMemo } from "react";
import type { PhoneTransactionDetail } from "../create-phone-ledger/create-phone-ledger.ts";
import {
  readTransactionContext,
  type TransactionContextCard,
  type TransactionContextLedger,
} from "./transaction-context.ts";

const NONE: readonly TransactionContextCard[] = [];

export function useTransactionContext(
  ledger: TransactionContextLedger,
  detail: PhoneTransactionDetail | null,
  revision: number,
): readonly TransactionContextCard[] {
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision invalidates this memo by identity, not by being read.
  return useMemo(
    () => (detail === null ? NONE : readTransactionContext(ledger, detail)),
    [ledger, detail, revision],
  );
}
