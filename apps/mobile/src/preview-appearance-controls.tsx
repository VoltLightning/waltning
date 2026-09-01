import type { AppearancePreference } from "@waltning/client/appearance/create-appearance";
import { useT } from "@waltning/ui/i18n/provider";
import { Button } from "@waltning/ui/primitives/button";
import { SegmentControl, type SegmentControlProps } from "@waltning/ui/primitives/segment-control";
import { BottomSheet } from "@waltning/ui/shell/bottom-sheet";
import { Card } from "@waltning/ui/shell/card";
import { makeStyles } from "@waltning/ui/theme/styles";
import * as tokens from "@waltning/ui/tokens";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

function isAppearancePreference(value: string): value is AppearancePreference {
  return value === "system" || value === "light" || value === "dark";
}

export type PreviewAppearanceControlsProps = {
  preference: AppearancePreference;
  resetEnabled: boolean;
  onPreference: (preference: AppearancePreference) => Promise<void>;
  onReset: () => void;
};

export function PreviewAppearanceControls({
  preference,
  resetEnabled,
  onPreference,
  onReset,
}: PreviewAppearanceControlsProps) {
  const t = useT();
  const styles = useStyles();
  // Three values, three words. The values are the contract `AppearancePreference`
  // names and never move; only the words do.
  const choices = useMemo<SegmentControlProps["segments"]>(
    () => [
      { value: "system", label: t("preview.system") },
      { value: "light", label: t("preview.light") },
      { value: "dark", label: t("preview.dark") },
    ],
    [t],
  );
  const [sheet, setSheet] = useState<"closed" | "appearance" | "reset">("closed");
  const [appearanceError, setAppearanceError] = useState(false);
  const showAppearance = useCallback(() => setSheet("appearance"), []);
  const dismiss = useCallback(() => setSheet("closed"), []);
  const showReset = useCallback(() => setSheet("reset"), []);
  const reset = useCallback(() => {
    onReset();
    setSheet("closed");
  }, [onReset]);
  const changePreference = useCallback(
    (next: string) => {
      if (!isAppearancePreference(next)) return;
      setAppearanceError(false);
      void onPreference(next).catch(() => setAppearanceError(true));
    },
    [onPreference],
  );

  return (
    <>
      <Button label={t("preview.appearance")} onPress={showAppearance} variant="primary" />
      <BottomSheet
        visible={sheet !== "closed"}
        title={sheet === "reset" ? t("preview.resetTitle") : t("preview.appearance")}
        onDismiss={dismiss}
      >
        {sheet === "reset" ? (
          <View style={styles.content}>
            <Card title={t("preview.resetPrompt")}>{null}</Card>
            <Button label={t("common.cancel")} onPress={showAppearance} variant="ghost" />
            <Button label={t("preview.resetTitle")} onPress={reset} variant="danger" />
          </View>
        ) : (
          <View style={styles.content}>
            <SegmentControl segments={choices} value={preference} onChange={changePreference} />
            {appearanceError ? <Card title={t("preview.appearanceFailed")}>{null}</Card> : null}
            {resetEnabled ? (
              <Button label={t("preview.resetAction")} onPress={showReset} variant="danger" />
            ) : null}
          </View>
        )}
      </BottomSheet>
    </>
  );
}

// `makeStyles` rather than `StyleSheet.create`, though nothing here reads the
// theme today. The pattern is the point: a stylesheet that cannot see the theme
// is one that answers "add a colour here" with an inline style, and this file
// already renders inside `ThemeProvider`.
const useStyles = makeStyles(() => ({ content: { gap: tokens.space.x3 } }));
