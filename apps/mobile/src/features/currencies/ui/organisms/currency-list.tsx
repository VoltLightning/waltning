/**
 * The currency list — a first slice of S17.
 *
 * Props only, no fetching: this is what makes the component renderable in a
 * test, in a diff preview, and offline from the replica. The screen hands it
 * data (`architecture/10`).
 *
 * S17 proper adds editing, archiving and the pivot switch. What is here is the
 * read, and it is deliberately not pretending to be the rest.
 */

import { StyleSheet, Text, View } from "react-native";
import type { Currency } from "../../api/use-currencies.ts";

export function CurrencyList({ currencies }: { currencies: readonly Currency[] }) {
  if (currencies.length === 0) {
    // Not a zero and not a spinner. §8's rule: a list with nothing in it says
    // so, because an empty list and a list that failed to load look identical
    // otherwise.
    return <Text style={styles.empty}>No currencies configured.</Text>;
  }

  return (
    <View style={styles.list}>
      {currencies.map((currency) => (
        <View key={currency.code} style={styles.row}>
          <Text style={styles.code}>{currency.code}</Text>
          <Text style={styles.name}>{currency.name}</Text>
          <Text style={styles.symbol}>{currency.symbol}</Text>
          {currency.isPivot ? <Text style={styles.pivot}>pivot</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 2, alignSelf: "stretch" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  code: { fontVariant: ["tabular-nums"], fontWeight: "600", width: 48 },
  name: { flex: 1, opacity: 0.85 },
  symbol: { opacity: 0.6, width: 28, textAlign: "right" },
  pivot: { fontSize: 11, opacity: 0.6, textTransform: "uppercase", letterSpacing: 0.5 },
  empty: { opacity: 0.6 },
});
