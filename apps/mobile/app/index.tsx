/**
 * Placeholder home screen.
 *
 * It exists to prove three things end to end, and it should be replaced by
 * S01 rather than grown:
 *
 *  1. `expo-router` serves the same route on native and web.
 *  2. `@waltning/core` resolves from the workspace under Metro — including
 *     its internal `./money.ts` specifier, which the spike verified
 *     synthetically and this verifies against the real package.
 *  3. Money arithmetic runs identically on the phone: `money.ts` is the one
 *     implementation, not a client copy.
 */

import { money } from "@waltning/core";
import { StyleSheet, Text, View } from "react-native";

// Deliberately arithmetic, not a literal: a literal would still render if the
// package failed to resolve to anything real.
const total = money.sum(["1200.50000000", "-349.99000000", "0.49000000"]);

export default function Home() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Waltning</Text>
      <Text style={styles.figure}>{money.toMoney(total, 2)}</Text>
      <Text style={styles.caption}>core resolves · money.ts runs here</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  title: { fontSize: 24, fontWeight: "600" },
  figure: { fontSize: 40, fontVariant: ["tabular-nums"] },
  caption: { fontSize: 13, opacity: 0.6 },
});
