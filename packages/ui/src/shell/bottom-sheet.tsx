import { useCallback, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Button } from "../primitives/button";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";

export type BottomSheetProps = {
  visible: boolean;
  title: string;
  onDismiss: () => void;
  children: React.ReactNode;
};

export function BottomSheet({ visible, title, onDismiss, children }: BottomSheetProps) {
  const [backdropFocused, setBackdropFocused] = useState(false);
  const styles = useStyles();
  const handleFocus = useCallback(() => setBackdropFocused(true), []);
  const handleBlur = useCallback(() => setBackdropFocused(false), []);
  if (!visible) return null;
  return (
    <Modal transparent visible onRequestClose={onDismiss} animationType="none">
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Dismiss ${title}`}
          onPress={onDismiss}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={[styles.backdrop, backdropFocused ? styles.backdropFocused : null]}
        />
        <View accessibilityLabel={title} accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Button label="Close" onPress={onDismiss} variant="ghost" />
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((t) => ({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    minHeight: touchTarget.min,
    backgroundColor: t.scrim,
    opacity: 0.5,
  },
  backdropFocused: {
    outlineWidth: focus.width,
    outlineColor: t.focusRing,
    outlineOffset: focus.offset,
  },
  sheet: {
    backgroundColor: t.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.x5,
    gap: space.x4,
    shadowColor: t.elevation.raised.shadowColor,
    shadowOpacity: t.elevation.raised.shadowOpacity,
    shadowRadius: t.elevation.raised.shadowRadius,
    shadowOffset: t.elevation.raised.shadowOffset,
    borderWidth: t.elevation.raised.borderWidth,
    borderColor: t.elevation.raised.borderColor,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: t.text, ...text.ui("displayThree") },
}));
