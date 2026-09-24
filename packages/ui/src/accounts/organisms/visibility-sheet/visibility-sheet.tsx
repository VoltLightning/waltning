/**
 * `<VisibilitySheet>` — S16 §3's two pills, one row per account.
 *
 * **Two toggles, because they are two questions.** *Show* takes an account out
 * of the register's list; *Count* leaves it in the list and out of the total.
 * A vault you want to see but not spend is the second; a card you have stopped
 * using is both. Folding them into one control would make *show me this* and
 * *count this* the same decision, and they are not.
 *
 * **Hiding switches counting off with it, here rather than at the executor.**
 * `set_account_visibility` refuses a hidden account that claims to be counted
 * — a row nobody can see still moving the total is a figure with no way to
 * check it. A sheet that let a person build that state and then bounced it
 * would be showing a control whose only outcome is a refusal, so pressing
 * *Show* off simply takes *Count* with it, visibly, in the same tap.
 *
 * **It is not archiving, and it says so.** Archiving means the account is
 * finished; this is a view preference on a live account, and the note under
 * the title is the only place a person is told the difference before they
 * choose.
 */

import { useCallback } from "react";
import { Text, View } from "react-native";
import { useT } from "../../../i18n/provider";
import { PressableScaled } from "../../../primitives/atoms/pressable-scaled/pressable-scaled";
import { useInteraction } from "../../../primitives/interaction.ts";
import { BottomSheet } from "../../../primitives/organisms/bottom-sheet/bottom-sheet";
import { focusBorder } from "../../../theme/focus.ts";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { hairline, radius, space, touchTarget } from "../../../tokens.ts";

export type VisibilityAccount = {
  id: string;
  name: string;
  /** The kind and currency, already worded — this sheet formats no domain values. */
  meta: string;
  hidden: boolean;
  inTotal: boolean;
};

export type VisibilitySheetProps = {
  visible: boolean;
  accounts: readonly VisibilityAccount[];
  onChange: (id: string, next: { hidden: boolean; inTotal: boolean }) => void;
  onDismiss: () => void;
};

export function VisibilitySheet({ visible, accounts, onChange, onDismiss }: VisibilitySheetProps) {
  const t = useT();
  const styles = useStyles();

  return (
    <BottomSheet visible={visible} title={t("accounts.whatCounts")} onDismiss={onDismiss} steady>
      <Text style={styles.note}>{t("accounts.whatCountsBody")}</Text>
      <View style={styles.rows}>
        {accounts.map((account, index) => (
          <VisibilityRow
            key={account.id}
            account={account}
            first={index === 0}
            onChange={onChange}
          />
        ))}
      </View>
    </BottomSheet>
  );
}

type VisibilityRowProps = {
  account: VisibilityAccount;
  /** The first row draws no rule above it — the sheet's own note begins the list. */
  first: boolean;
  onChange: (id: string, next: { hidden: boolean; inTotal: boolean }) => void;
};

function VisibilityRow({ account, first, onChange }: VisibilityRowProps) {
  const t = useT();
  const styles = useStyles();

  const toggleShown = useCallback(() => {
    const shown = account.hidden;
    // Hiding takes counting with it — see the file header. Showing restores
    // counting too: an account coming back into the list with its figure
    // silently left out would be the same puzzle in reverse.
    onChange(account.id, { hidden: !shown, inTotal: shown });
  }, [account.hidden, account.id, onChange]);

  const toggleCounted = useCallback(() => {
    onChange(account.id, { hidden: account.hidden, inTotal: !account.inTotal });
  }, [account.hidden, account.id, account.inTotal, onChange]);

  const shown = !account.hidden;

  return (
    <View style={[styles.row, first ? null : styles.ruled]}>
      <View style={styles.identity}>
        <Text style={styles.name} numberOfLines={1}>
          {account.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {account.meta}
        </Text>
      </View>
      <Pill label={t("accounts.show")} on={shown} onPress={toggleShown} />
      <Pill
        label={t("accounts.count")}
        on={account.inTotal}
        onPress={toggleCounted}
        disabled={!shown}
      />
    </View>
  );
}

/**
 * One flag, as a switch.
 *
 * **`switch`, not `button`.** The control has a state a reader needs announced
 * — *Count, on* — and a button announces only its name, so a screen reader
 * would have no way to tell a counted account from an uncounted one. It is
 * never colour alone either (P5): the label is the same, and the fill and the
 * border are what change, under an `accessibilityState` that says which.
 */
function Pill({
  label,
  on,
  onPress,
  disabled = false,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  return (
    <PressableScaled
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on, disabled }}
      aria-checked={on}
      disabled={disabled}
      onPress={onPress}
      {...handlers}
      style={[
        styles.pill,
        on ? styles.pillOn : styles.pillOff,
        disabled ? styles.pillDisabled : null,
        focused ? styles.focused : null,
      ]}
    >
      <Text style={[styles.pillLabel, on ? styles.pillLabelOn : null]}>{label}</Text>
    </PressableScaled>
  );
}

const useStyles = makeStyles((theme) => ({
  note: { color: theme.textMuted, ...text.ui("bodySm") },
  rows: { flexDirection: "column" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.lg,
    minHeight: touchTarget.min,
  },
  /** The same inset rule the register draws between accounts, for the same reason. */
  ruled: { borderTopWidth: hairline.width, borderTopColor: theme.hairline },
  identity: { flex: 1, minWidth: 0, gap: space.xxs },
  name: { color: theme.text, ...text.ui("body", 500) },
  meta: { color: theme.textMuted, ...text.ui("caption") },
  pill: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.x3,
  },
  pillOn: { borderColor: theme.accentFillBorder, backgroundColor: theme.accentFill },
  pillOff: { borderColor: theme.borderInteractive, backgroundColor: "transparent" },
  pillDisabled: { opacity: 0.5 },
  pillLabel: { color: theme.textMuted, ...text.ui("label", 600) },
  pillLabelOn: { color: theme.accentText },
  focused: focusBorder(theme.focusRing, { horizontal: space.x3, vertical: 0 }),
}));
