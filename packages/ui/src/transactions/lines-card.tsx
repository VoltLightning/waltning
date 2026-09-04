/**
 * `<LinesCard>` — `screens/S09-transaction-detail.md` §3 mobile, the
 * optional breakdown (§10.3): rows of description · amount, a live sum
 * against the transaction's own total, and `+ Add`.
 *
 * **The whole set replaces the old one, on save — matching the executor.**
 * `set-transaction-lines.executor.ts` deletes every existing line and
 * inserts what it is handed; there is no per-line patch. This card mirrors
 * that shape: one draft array, one `Save`, rather than a save-per-row that
 * would imply an update path the executor does not have.
 *
 * **A line's category is shown, never assigned, this pass.** `readTransaction`
 * carries `categoryId`/`categoryName` per line and this card passes an
 * existing line's `categoryId` straight through on save — an editor for it
 * would need the same screen-owned `CategorySheet` escape `FieldsCard` uses,
 * once per open row, and the plan this card was built from did not ask for
 * it. Named here so it reads as a decision, not an oversight; a new line
 * always saves with `categoryId: null`.
 *
 * **`total` is the transaction's own unsigned magnitude**, not the signed
 * figure `TransactionHero` shows — `set_transaction_lines` checks the lines'
 * sum against `amount_original`, which never carries a sign, and the caller
 * passes exactly that.
 */

import { id as brandId } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { randomId } from "@waltning/core/random";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Amount } from "../fx/amount";
import { AmountField, parseAmount } from "../fx/amount-field";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { Chip } from "../primitives/chip";
import type { FieldErrorMap } from "../primitives/field-errors.ts";
import { TextField } from "../primitives/text-field";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type LinesCardLine = {
  id: string;
  description: string;
  amount: money.Money;
  categoryId: string | null;
  categoryName: string | null;
};

/** What `onSave` sends — the whole set, `set_transaction_lines`'s own shape. */
export type LinesCardDraftLine = {
  id: string;
  description: string;
  amount: string;
  categoryId: string | null;
};

export type LinesCardProps = {
  lines: readonly LinesCardLine[];
  /** The transaction's own `amount_original` — unsigned, see above. */
  total: money.Money;
  currency: string;
  decimals?: number;
  fieldErrors?: FieldErrorMap;
  saving?: boolean;
  onSave: (lines: readonly LinesCardDraftLine[]) => void;
};

type DraftLine = {
  id: string;
  description: string;
  amount: string;
  categoryId: string | null;
  categoryName: string | null;
};

function toDraft(line: LinesCardLine): DraftLine {
  return { ...line, amount: line.amount };
}

export function LinesCard({
  lines,
  total,
  currency,
  decimals = 2,
  fieldErrors,
  saving = false,
  onSave,
}: LinesCardProps) {
  const t = useT();
  const styles = useStyles();

  const [draft, setDraft] = useState<readonly DraftLine[]>(() => lines.map(toDraft));
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const handleAdd = useCallback(() => {
    const newId = brandId<"transactionLines">(randomId());
    setDraft((current) => [
      ...current,
      { id: newId, description: "", amount: "", categoryId: null, categoryName: null },
    ]);
    setOpen((current) => new Set(current).add(newId));
  }, []);

  const sum = useMemo(() => {
    const amounts = draft
      .map((line) => parseAmount(line.amount))
      .filter((value): value is string => value !== null)
      .map((value) => money.toMoney(value));
    return amounts.length > 0 ? money.sum(amounts) : money.toMoney("0");
  }, [draft]);
  const balanced = draft.length === 0 || money.eq(sum, total);

  const changed = useMemo(() => {
    if (draft.length !== lines.length) return true;
    return draft.some((line, index) => {
      const saved = lines[index];
      return (
        !saved ||
        saved.id !== line.id ||
        saved.description !== line.description ||
        saved.amount !== line.amount
      );
    });
  }, [draft, lines]);

  const handleSave = useCallback(() => {
    if (!changed || saving) return;
    onSave(
      draft.map((line) => ({
        id: line.id,
        description: line.description,
        amount: line.amount,
        categoryId: line.categoryId,
      })),
    );
  }, [changed, draft, onSave, saving]);

  const formLevelErrors = fieldErrors?.formLevel ?? [];

  return (
    <View style={styles.root}>
      {formLevelErrors.length > 0 ? (
        <View style={styles.formLevel} accessibilityRole="alert">
          {formLevelErrors.map((message) => (
            <Text key={message} style={styles.formLevelMessage}>
              {message}
            </Text>
          ))}
        </View>
      ) : null}

      {draft.map((line) => (
        <LineRow
          key={line.id}
          line={line}
          currency={currency}
          decimals={decimals}
          isOpen={open.has(line.id)}
          setDraft={setDraft}
          setOpen={setOpen}
        />
      ))}

      {draft.length > 0 ? (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t("transactions.total")}</Text>
          <View style={styles.totalValue}>
            <Amount value={sum} currency={currency} decimals={decimals} size="small" />
            <Text style={balanced ? styles.balanced : styles.unbalanced}>
              {balanced ? "✓" : "≠"}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button label={t("transactions.addLine")} onPress={handleAdd} variant="ghost" />
        {/* An empty card with nothing added has nothing to save — a second
            `Save` beside `FieldsCard`'s own, permanently disabled, is a
            confusing sibling rather than a state worth showing. */}
        {draft.length > 0 || lines.length > 0 ? (
          <Button
            label={t("common.save")}
            onPress={handleSave}
            disabled={!changed}
            loading={saving}
            variant="primary"
          />
        ) : null}
      </View>
    </View>
  );
}

type LineRowProps = {
  line: DraftLine;
  currency: string;
  decimals: number;
  isOpen: boolean;
  setDraft: (updater: (current: readonly DraftLine[]) => readonly DraftLine[]) => void;
  setOpen: (updater: (current: ReadonlySet<string>) => ReadonlySet<string>) => void;
};

function LineRow({ line, currency, decimals, isOpen, setDraft, setOpen }: LineRowProps) {
  const t = useT();
  const styles = useStyles();

  const handleToggle = useCallback(() => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(line.id)) next.delete(line.id);
      else next.add(line.id);
      return next;
    });
  }, [line.id, setOpen]);

  const handleDescriptionChange = useCallback(
    (next: string) => {
      setDraft((current) =>
        current.map((candidate) =>
          candidate.id === line.id ? { ...candidate, description: next } : candidate,
        ),
      );
    },
    [line.id, setDraft],
  );

  const handleAmountChange = useCallback(
    (next: string | null) => {
      setDraft((current) =>
        current.map((candidate) =>
          candidate.id === line.id ? { ...candidate, amount: next ?? "" } : candidate,
        ),
      );
    },
    [line.id, setDraft],
  );

  const handleRemove = useCallback(() => {
    setDraft((current) => current.filter((candidate) => candidate.id !== line.id));
  }, [line.id, setDraft]);

  const parsedAmount = parseAmount(line.amount);
  const formattedAmount =
    parsedAmount === null ? line.amount : money.forDisplay(money.toMoney(parsedAmount), decimals);
  const displayValue = [line.description || t("transactions.lineDescription"), formattedAmount]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.line}>
      <Chip
        placeholder={t("transactions.lineDescription")}
        value={displayValue}
        onPress={handleToggle}
      />
      {isOpen ? (
        <View style={styles.lineEditor}>
          <TextField
            label={t("transactions.lineDescription")}
            value={line.description}
            onChangeText={handleDescriptionChange}
            maxLength={200}
          />
          <AmountField
            label={t("transactions.amount")}
            currency={currency}
            initial={line.amount}
            onChange={handleAmountChange}
          />
          {line.categoryName ? <Text style={styles.category}>{line.categoryName}</Text> : null}
          <Button label={t("transactions.delete")} onPress={handleRemove} variant="ghost" />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.x3 },
  line: { gap: space.sm },
  lineEditor: { gap: space.md },
  category: { color: theme.textMuted, ...text.ui("caption") },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: theme.hairline,
    paddingTop: space.sm,
  },
  totalLabel: { color: theme.textMuted, ...text.ui("kicker") },
  totalValue: { flexDirection: "row", alignItems: "center", gap: space.sm },
  balanced: { color: theme.income, ...text.ui("body", 600) },
  unbalanced: { color: theme.dangerText, ...text.ui("body", 600) },
  formLevel: { gap: space.xs },
  formLevelMessage: { color: theme.dangerText, ...text.ui("caption") },
  actions: { flexDirection: "row", justifyContent: "space-between", gap: space.xl },
}));
