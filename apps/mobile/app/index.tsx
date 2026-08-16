/**
 * Home route.
 *
 * A route composes features and owns data fetching; it does not hold
 * components of its own. This one is a placeholder until S01 exists, but the
 * shape is the one every screen follows.
 */

import { StyleSheet, Text, View } from "react-native";
import { NetPosition } from "../src/features/dashboard/index.ts";

export default function Home() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Waltning</Text>
      <NetPosition amounts={["1200.50000000", "-349.99000000", "0.49000000"]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  title: { fontSize: 24, fontWeight: "600" },
});
