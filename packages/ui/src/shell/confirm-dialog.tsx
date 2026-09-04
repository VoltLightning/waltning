/**
 * `<ConfirmDialog>` — `design-system/05` §5. *"Genuinely destructive and
 * irreversible only — deleting an account, changing the pivot currency,
 * running a restore drill."* S19 adds a fourth: merging two categories,
 * which J12 states plainly is **not reversible in one step**.
 *
 * A centred card, not a sheet — the choice is the whole screen's attention
 * for a moment, not a panel sliding up over content still visible behind it.
 * Two actions, and the confirming one is `danger`: the only place in the
 * design system a `primary` decision is drawn in the danger ink rather than
 * the accent, because agreeing *is* the destructive act here.
 */

import { useCallback, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";

export type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const t = useT();
  const [backdropFocused, setBackdropFocused] = useState(false);
  const styles = useStyles();
  const handleFocus = useCallback(() => setBackdropFocused(true), []);
  const handleBlur = useCallback(() => setBackdropFocused(false), []);
  if (!visible) return null;

  return (
    <Modal transparent visible onRequestClose={onCancel} animationType="none">
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Dismiss ${title}`}
          onPress={onCancel}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={[styles.backdrop, backdropFocused ? styles.backdropFocused : null]}
        />
        <View accessibilityLabel={title} accessibilityViewIsModal style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <View style={styles.actions}>
            <Button label={t("common.cancel")} onPress={onCancel} variant="secondary" />
            <Button label={confirmLabel} onPress={onConfirm} variant="danger" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((theme) => ({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.x5 },
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    minHeight: touchTarget.min,
    backgroundColor: theme.scrim,
    opacity: 0.5,
  },
  backdropFocused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: theme.surface,
    borderRadius: radius.lg,
    padding: space.x5,
    gap: space.x3,
    shadowColor: theme.elevation.raised.shadowColor,
    shadowOpacity: theme.elevation.raised.shadowOpacity,
    shadowRadius: theme.elevation.raised.shadowRadius,
    shadowOffset: theme.elevation.raised.shadowOffset,
    borderWidth: theme.elevation.raised.borderWidth,
    borderColor: theme.elevation.raised.borderColor,
  },
  title: { color: theme.text, ...text.ui("displayThree") },
  body: { color: theme.textMuted, ...text.ui("body") },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.x3 },
}));
