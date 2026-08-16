/**
 * Placeholder for S01's headline figure, living where it belongs: inside the
 * feature that owns it, not in a global `organisms/` bucket beside every other
 * feature's components.
 *
 * Replaced by the real `DualTotal` when S01 is built.
 */

import { money } from "@waltning/core";
import { StyleSheet, Text, View } from "react-native";

export function NetPosition({ amounts }: { amounts: readonly money.Money[] }) {
  const total = money.sum([...amounts]);
  return (
    <View style={styles.block}>
      <Text style={styles.figure}>{money.toMoney(total, 2)}</Text>
      <Text style={styles.caption}>net position</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { alignItems: "center", gap: 4 },
  figure: { fontSize: 40, fontVariant: ["tabular-nums"] },
  caption: { fontSize: 13, opacity: 0.6 },
});
