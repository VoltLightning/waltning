/**
 * `<CounterpartyForm>` — S15. Create and edit, one component: name, kind
 * (`SegmentControl` — it decides whether ageing applies at all, O15), settles
 * in (`Select` over currencies — **their** preference, not a system
 * concept), contact, note, and `MatchWarning`'s slot.
 *
 * **The near-match check is computed by the screen, not this form.**
 * `nearMatches` (`@waltning/client/counterparties/near-matches`) is a
 * `packages/client` module, and `packages/ui` never imports `packages/client`
 * (`architecture/11`) — so this component takes `matches`, already ranked,
 * and reports `onNameBlur` upward to ask for a fresh answer. S15 §7: the
 * check fires on blur, never on every keystroke.
 *
 * **Up to three warnings, one per candidate — S15 §9.1's "top three
 * ranked… you choose."** `MatchWarning` itself shows one candidate; this
 * form maps `matches` onto one `MatchWarning` each rather than inventing a
 * multi-candidate variant of an already-built, tested component.
 */

import type * as money from "@waltning/core/money";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import type { FieldErrorMap } from "../primitives/field-errors.ts";
import { SegmentControl } from "../primitives/segment-control";
import { Select } from "../primitives/select";
import { TextField } from "../primitives/text-field";
import { MatchWarning } from "../states/match-warning";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type CounterpartyKind = "person" | "company";

export type CounterpartyFormValues = {
  name: string;
  kind: CounterpartyKind;
  settlementCurrency: string | null;
  contact: string;
  note: string;
};

export type CounterpartyFormCandidate = {
  id: string;
  name: string;
  balance: money.Money;
  currency: string;
  decimals?: number;
  transactionCount: number;
};

export type CounterpartyFormCurrency = { code: string; name: string };

export type CounterpartyFormProps = {
  initial: CounterpartyFormValues;
  currencies: readonly CounterpartyFormCurrency[];
  /** Ranked, already excluding recorded-distinct pairs — `nearMatches`' own answer, capped at three. */
  matches: readonly CounterpartyFormCandidate[];
  /** Fires on blur of the name field (S15 §7) — the screen recomputes `matches`. */
  onNameBlur: (name: string) => void;
  /** "This is the same person" for one candidate. */
  onSame: (candidateId: string) => void;
  /** "These are different" for one candidate — dismisses just that warning. */
  onDifferent: (candidateId: string) => void;
  /** Present only in edit mode — archiving does not exist while creating. */
  onArchive?: () => void;
  fieldErrors?: FieldErrorMap;
  onCancel: () => void;
  onSave: (values: CounterpartyFormValues) => void;
};

export function CounterpartyForm({
  initial,
  currencies,
  matches,
  onNameBlur,
  onSame,
  onDifferent,
  onArchive,
  fieldErrors,
  onCancel,
  onSave,
}: CounterpartyFormProps) {
  const t = useT();
  const styles = useStyles();

  const [name, setName] = useState(initial.name);
  const [kind, setKind] = useState<CounterpartyKind>(initial.kind);
  const [settlementCurrency, setSettlementCurrency] = useState<string | null>(
    initial.settlementCurrency,
  );
  const [contact, setContact] = useState(initial.contact);
  const [note, setNote] = useState(initial.note);

  const handleBlurName = useCallback(() => onNameBlur(name), [name, onNameBlur]);

  const kindSegments = useMemo(
    (): readonly [
      { value: CounterpartyKind; label: string },
      { value: CounterpartyKind; label: string },
    ] => [
      { value: "person", label: t("counterparties.kindPerson") },
      { value: "company", label: t("counterparties.kindCompany") },
    ],
    [t],
  );
  const handleKindChange = useCallback(
    (next: string) => setKind(next as CounterpartyKind),
    [],
  );

  const currencyOptions = useMemo(
    () => currencies.map((currency) => ({ value: currency.code, label: currency.code })),
    [currencies],
  );

  const trimmedName = name.trim();
  const canSave = trimmedName !== "";
  const handleSave = useCallback(() => {
    if (!canSave) return;
    onSave({ name: trimmedName, kind, settlementCurrency, contact, note });
  }, [canSave, contact, kind, note, onSave, settlementCurrency, trimmedName]);

  const nameError = fieldErrors?.byField["name"]?.[0];

  return (
    <View style={styles.root}>
      {fieldErrors && fieldErrors.formLevel.length > 0 ? (
        <View style={styles.formLevel} accessibilityRole="alert">
          {fieldErrors.formLevel.map((message) => (
            <Text key={message} style={styles.formLevelMessage}>
              {message}
            </Text>
          ))}
        </View>
      ) : null}

      <TextField
        label={t("common.name")}
        value={name}
        onChangeText={setName}
        onBlur={handleBlurName}
        maxLength={200}
        {...(nameError === undefined ? {} : { error: nameError })}
      />

      {matches.map((candidate) => (
        <CandidateWarning
          key={candidate.id}
          candidate={candidate}
          onSame={onSame}
          onDifferent={onDifferent}
        />
      ))}

      <SegmentControl segments={kindSegments} value={kind} onChange={handleKindChange} />

      <Select
        label={t("counterparties.settlementLabel")}
        placeholder={t("counterparties.noSettlementCurrency")}
        options={currencyOptions}
        value={settlementCurrency}
        onChange={setSettlementCurrency}
        searchable
      />

      <TextField label={t("counterparties.contact")} value={contact} onChangeText={setContact} />
      <TextField
        label={t("common.note")}
        value={note}
        onChangeText={setNote}
        maxLength={2000}
        counter
      />

      <View style={styles.actions}>
        <Button label={t("common.cancel")} onPress={onCancel} variant="ghost" />
        <Button
          label={t("common.save")}
          onPress={handleSave}
          disabled={!canSave}
          variant="primary"
        />
      </View>

      {onArchive ? (
        <View style={styles.secondaryActions}>
          <Button label={t("counterparties.archive")} onPress={onArchive} variant="danger" />
        </View>
      ) : null}
    </View>
  );
}

type CandidateWarningProps = {
  candidate: CounterpartyFormCandidate;
  onSame: (candidateId: string) => void;
  onDifferent: (candidateId: string) => void;
};

/**
 * One candidate's own `MatchWarning`, in its own component — `.map`'s own
 * callback binding belongs to a component, never a hook called conditionally
 * inside the loop that builds the list (`architecture/11`, Rules of Hooks).
 */
function CandidateWarning({ candidate, onSame, onDifferent }: CandidateWarningProps) {
  const handleSame = useCallback(() => onSame(candidate.id), [candidate.id, onSame]);
  const handleDifferent = useCallback(() => onDifferent(candidate.id), [candidate.id, onDifferent]);
  return (
    <MatchWarning
      candidate={{
        name: candidate.name,
        balance: candidate.balance,
        currency: candidate.currency,
        ...(candidate.decimals === undefined ? {} : { decimals: candidate.decimals }),
        transactionCount: candidate.transactionCount,
      }}
      onSame={handleSame}
      onDifferent={handleDifferent}
    />
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.xl },
  formLevel: { gap: space.xs },
  formLevelMessage: { color: theme.dangerText, ...text.ui("caption") },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.xl },
  secondaryActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: space.xl,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
}));
