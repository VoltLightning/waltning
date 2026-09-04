/**
 * S15 · Counterparty editor — create and edit, one screen for both routes
 * (`/counterparty/new`, `/counterparty/[id]/edit`), the same way the plan
 * names it: mode is decided by whether the route carries an `id`.
 *
 * **The near-match check is computed here, not by `CounterpartyForm`.**
 * `nearMatches` (`@waltning/client/counterparties/near-matches`) is a
 * `packages/client` module; `packages/ui` never imports it (`architecture/11`).
 * This screen recomputes the ranked candidates on every name blur and hands
 * them down as a prop.
 *
 * **"Same person" differs by mode** (S15 §9.1): in edit mode it merges — the
 * record open here is the loser, the matched candidate the winner — and
 * lands on the winner's own detail page. In create mode nothing has been
 * created yet to merge, so it simply picks the existing counterparty and
 * finishes the same way a save would.
 *
 * **"These are different" is local-only in create mode.**
 * `record_distinct_counterparties` needs two existing ids, so a brand-new
 * draft has nothing to persist yet — the warning is dismissed for this
 * session and reappears if the name is blurred again from scratch after a
 * reload. In edit mode it is persisted, and `snapshot.distinctCounterpartyPairs`
 * (read whole on every `refresh()`) is threaded into `nearMatches` as
 * `distinctPairs`, so a pair told apart in an earlier session is never asked
 * about again either — the same guarantee S15 §9.1 states for one session.
 */

import {
  groupByCounterparty,
  makeRateOf,
  resolveCounterpartyFigures,
} from "@waltning/client/counterparties/counterparty-figures";
import { nearMatches } from "@waltning/client/counterparties/near-matches";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import type { FieldError } from "@waltning/client/transport/field-errors";
import { mapFieldErrors } from "@waltning/client/transport/field-errors";
import {
  CounterpartyForm,
  type CounterpartyFormCandidate,
  type CounterpartyFormValues,
} from "@waltning/ui/counterparties/counterparty-form";
import { useT } from "@waltning/ui/i18n/provider";
import { Card, GroundPanel } from "@waltning/ui/shell/card";
import { Toast } from "@waltning/ui/states/toast";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";

/**
 * `update_counterparty` and `create_counterparty`'s own field paths —
 * everything else lands at form level. **Not `"version"` or `"archived"`,
 * deliberately**: `CounterpartyForm` only ever reads `byField.name` and
 * `formLevel`, so listing them here routed a stale-version or open-balance
 * refusal straight into a `byField` bucket nothing renders, and it vanished.
 * A stale version now reaches `formLevel` (`transactions.changedElsewhere`'s
 * own shape — the whole row is stale, not one field of it); `handleArchive`
 * below intercepts an open-balance refusal before it ever reaches
 * `mapFieldErrors` at all, and shows it on a `Toast` instead — the plan's
 * own wording, and the executor's own message.
 */
const KNOWN_PATHS = ["name"];

function resolveFieldErrorMessage(t: ReturnType<typeof useT>, error: FieldError): string {
  if (error.messageKey === "counterparties.nameCollision") return t("counterparties.nameCollision");
  if (error.messageKey === "counterparties.staleVersion") return t("counterparties.staleVersion");
  if (error.messageKey === "counterparties.openBalance") return t("counterparties.openBalance");
  return error.message;
}

export default function CounterpartyEditor() {
  const t = useT();
  const ledger = useLedgerController();
  const snapshot = usePhoneLedger(ledger);
  const today = deviceRuntime().capture().date;
  const {
    id: rawId,
    returnTo,
    amount,
    accountId,
  } = useLocalSearchParams<{
    id?: string;
    returnTo?: string;
    amount?: string;
    accountId?: string;
  }>();
  const editMode = rawId !== undefined;
  const counterparty = editMode
    ? (snapshot.counterparties.find((candidate) => candidate.id === rawId) ??
      snapshot.archivedCounterparties.find((candidate) => candidate.id === rawId))
    : undefined;

  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof mapFieldErrors>>();
  const [blurredName, setBlurredName] = useState("");
  const [dismissedIds, setDismissedIds] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const currencies = useMemo(
    () => snapshot.currencies.map((currency) => ({ code: currency.code, name: currency.name })),
    [snapshot.currencies],
  );

  const initial: CounterpartyFormValues = counterparty
    ? {
        name: counterparty.name,
        kind: counterparty.kind,
        settlementCurrency: counterparty.settlementCurrency,
        contact: counterparty.contact ?? "",
        note: counterparty.note,
      }
    : { name: "", kind: "person", settlementCurrency: null, contact: "", note: "" };

  const pivot = snapshot.currencies.find((currency) => currency.isPivot)?.code;
  const balances = useMemo(() => ledger.listCounterpartyBalances(today), [ledger, today]);

  const matches = useMemo((): readonly CounterpartyFormCandidate[] => {
    if (blurredName.trim() === "" || !pivot) return [];
    const candidates = snapshot.counterparties.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
    }));
    const ranked = nearMatches(blurredName, candidates, {
      ...(counterparty ? { excludeId: counterparty.id } : {}),
      distinctPairs: snapshot.distinctCounterpartyPairs,
    }).filter((match) => !dismissedIds.has(match.candidate.id));

    const rateOf = makeRateOf(ledger.readRate, pivot, today);
    // M2 — grouped once for every candidate, not once *per* candidate: this
    // never depends on which candidate is being resolved.
    const groups = groupByCounterparty(balances);
    return ranked.map(({ candidate }) => {
      const group = groups.find((g) => g.counterpartyId === candidate.id);
      const figures = resolveCounterpartyFigures(
        { settlementCurrency: group?.settlementCurrency ?? null, balances: group?.balances ?? [] },
        pivot,
        rateOf,
        snapshot.currencies,
      );
      const transactionCount = ledger.searchTransactions({ counterpartyId: candidate.id }).total
        .count;
      return {
        id: candidate.id,
        name: candidate.name,
        balance: figures.value,
        currency: figures.currency,
        decimals: figures.decimals,
        transactionCount,
      };
    });
  }, [
    balances,
    blurredName,
    counterparty,
    dismissedIds,
    ledger,
    pivot,
    snapshot.counterparties,
    snapshot.currencies,
    snapshot.distinctCounterpartyPairs,
    today,
  ]);

  const handleNameBlur = useCallback((name: string) => setBlurredName(name), []);

  /** Where both a successful save and "same person" (create mode) end up. */
  const finish = useCallback(
    (id: string) => {
      if (returnTo === "quick-add") {
        router.dismissTo({
          pathname: "/quick-add",
          params: { amount: amount ?? "", ...(accountId ? { accountId } : {}), counterpartyId: id },
        });
        return;
      }
      router.back();
    },
    [accountId, amount, returnTo],
  );

  const handleSave = useCallback(
    (values: CounterpartyFormValues) => {
      if (editMode && counterparty) {
        const patch: Parameters<typeof ledger.updateCounterparty>[0]["patch"] = {};
        if (values.name !== counterparty.name) patch.name = values.name;
        if (values.kind !== counterparty.kind) patch.kind = values.kind;
        if (values.settlementCurrency !== counterparty.settlementCurrency) {
          patch.settlementCurrency = values.settlementCurrency;
        }
        if (values.contact !== (counterparty.contact ?? "")) patch.contact = values.contact || null;
        if (values.note !== counterparty.note) patch.note = values.note;
        if (Object.keys(patch).length === 0) {
          router.back();
          return;
        }
        const result = ledger.updateCounterparty({
          id: counterparty.id,
          version: counterparty.version,
          patch,
        });
        if (!("id" in result)) {
          const resolved = result.fieldErrors.map((error) => ({
            path: error.path,
            message: resolveFieldErrorMessage(t, error),
          }));
          setFieldErrors(mapFieldErrors(resolved, KNOWN_PATHS));
          return;
        }
        setFieldErrors(undefined);
        router.back();
        return;
      }

      const result = ledger.createCounterparty(values);
      if (!("id" in result)) {
        const resolved = result.fieldErrors.map((error) => ({
          path: error.path,
          message: resolveFieldErrorMessage(t, error),
        }));
        setFieldErrors(mapFieldErrors(resolved, KNOWN_PATHS));
        return;
      }
      setFieldErrors(undefined);
      finish(result.id);
    },
    [counterparty, editMode, finish, ledger, t],
  );

  const handleSame = useCallback(
    (candidateId: string) => {
      if (editMode && counterparty) {
        const result = ledger.mergeCounterparties({
          winnerId: candidateId,
          loserId: counterparty.id,
        });
        if (!("id" in result)) {
          setToast(result.fieldErrors[0]?.message ?? t("common.couldNotSave"));
          return;
        }
        router.dismissTo(`/counterparty/${candidateId}`);
        return;
      }
      finish(candidateId);
    },
    [counterparty, editMode, finish, ledger, t],
  );

  const handleDifferent = useCallback(
    (candidateId: string) => {
      if (editMode && counterparty) {
        const result = ledger.recordDistinctCounterparties({
          aId: counterparty.id,
          bId: candidateId,
        });
        if (!("aId" in result)) {
          setToast(result.fieldErrors[0]?.message ?? t("common.couldNotSave"));
        }
      }
      setDismissedIds((current) => new Set(current).add(candidateId));
    },
    [counterparty, editMode, ledger, t],
  );

  const handleArchive = useMemo(() => {
    if (!editMode || !counterparty) return undefined;
    return () => {
      const result = ledger.updateCounterparty({
        id: counterparty.id,
        version: counterparty.version,
        patch: { archived: true },
      });
      if (!("id" in result)) {
        // An open balance refuses archiving on the `archived` field — the
        // executor's own message, on a `Toast`, never a form-level line no
        // one asked to archive twice to notice.
        const openBalance = result.fieldErrors.find(
          (error) => error.messageKey === "counterparties.openBalance",
        );
        if (openBalance) {
          setToast(resolveFieldErrorMessage(t, openBalance));
          return;
        }
        const resolved = result.fieldErrors.map((error) => ({
          path: error.path,
          message: resolveFieldErrorMessage(t, error),
        }));
        setFieldErrors(mapFieldErrors(resolved, KNOWN_PATHS));
        return;
      }
      router.dismissTo("/(tabs)/debt");
    };
  }, [counterparty, editMode, ledger, t]);

  const handleCancel = useCallback(() => router.back(), []);
  const handleDismissToast = useCallback(() => setToast(null), []);

  if (editMode && !counterparty) return null;

  return (
    <GroundPanel>
      <Card>
        <CounterpartyForm
          initial={initial}
          currencies={currencies}
          matches={matches}
          onNameBlur={handleNameBlur}
          onSame={handleSame}
          onDifferent={handleDifferent}
          {...(handleArchive ? { onArchive: handleArchive } : {})}
          {...(fieldErrors === undefined ? {} : { fieldErrors })}
          onCancel={handleCancel}
          onSave={handleSave}
        />
      </Card>
      {toast === null ? null : <Toast message={toast} onDismiss={handleDismissToast} />}
    </GroundPanel>
  );
}
