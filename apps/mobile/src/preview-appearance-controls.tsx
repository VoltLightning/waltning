import type { AppearancePreference } from "@waltning/client/appearance/create-appearance";
import { Button } from "@waltning/ui/primitives/button";
import { SegmentControl } from "@waltning/ui/primitives/segment-control";
import { BottomSheet } from "@waltning/ui/shell/bottom-sheet";
import { Card } from "@waltning/ui/shell/card";
import * as tokens from "@waltning/ui/tokens";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

const APPEARANCE_CHOICES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

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
  const [sheet, setSheet] = useState<"closed" | "appearance" | "reset">("closed");
  const [appearanceError, setAppearanceError] = useState(false);

  return (
    <>
      <Button label="Appearance" onPress={() => setSheet("appearance")} variant="primary" />
      <BottomSheet
        visible={sheet !== "closed"}
        title={sheet === "reset" ? "Delete preview data" : "Appearance"}
        onDismiss={() => setSheet("closed")}
      >
        {sheet === "reset" ? (
          <View style={styles.content}>
            <Card title="Delete every account and transaction from this phone?">{null}</Card>
            <Button label="Cancel" onPress={() => setSheet("appearance")} variant="ghost" />
            <Button
              label="Delete preview data"
              onPress={() => {
                onReset();
                setSheet("closed");
              }}
              variant="danger"
            />
          </View>
        ) : (
          <View style={styles.content}>
            <SegmentControl
              segments={APPEARANCE_CHOICES}
              value={preference}
              onChange={(next) => {
                if (!isAppearancePreference(next)) return;
                setAppearanceError(false);
                void onPreference(next).catch(() => setAppearanceError(true));
              }}
            />
            {appearanceError ? <Card title="Appearance could not be saved.">{null}</Card> : null}
            {resetEnabled ? (
              <Button
                label="Reset preview data"
                onPress={() => setSheet("reset")}
                variant="danger"
              />
            ) : null}
          </View>
        )}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({ content: { gap: tokens.space.x3 } });
