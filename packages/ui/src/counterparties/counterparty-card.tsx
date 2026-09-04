/**
 * `<CounterpartyCard>` — S13 §3, §4. Name, kind, settlement currency,
 * monogram — the header above `BalanceLedger`.
 *
 * **The ageing bar is optional and companies-only** (O15): S13 §3 draws it
 * inline only on the web layout ("web adds the ageing bar inline for
 * companies"), so this component accepts it rather than always rendering it —
 * the screen decides, by surface, whether to pass it.
 */

import type { AgeBucket } from "@waltning/core/money";
import { Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { radius, space } from "../tokens.ts";
import { AgeingBar } from "./ageing-bar";
import { monogramFor } from "./monogram.ts";

export type CounterpartyCardProps = {
  name: string;
  kind: "person" | "company";
  settlementCurrency: string | null;
  /** Companies only (O15) — pass only where the surface draws it inline (S13 §3). */
  ageing?: { ageDays: number; bucket: AgeBucket } | null;
};

export function CounterpartyCard({ name, kind, settlementCurrency, ageing }: CounterpartyCardProps) {
  const t = useT();
  const styles = useStyles();
  const monogram = monogramFor(name);
  // Computed rather than in `useStyles`: the tint is per-name, a prop, not a
  // theme-scale constant — `tag.tsx`'s own `fill`/`ink` are the same shape, a
  // plain object built beside the JSX rather than inline inside it.
  const monogramFill = { backgroundColor: monogram.fill };
  const monogramInk = { color: monogram.ink };

  return (
    <View style={styles.root}>
      <View style={[styles.monogram, monogramFill]}>
        <Text style={[styles.monogramText, monogramInk]}>{monogram.letter}</Text>
      </View>
      <View style={styles.identity}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.meta}>
          {t(kind === "company" ? "counterparties.kindCompany" : "counterparties.kindPerson")}
          {settlementCurrency
            ? ` · ${t("counterparties.settlesIn", { currency: settlementCurrency })}`
            : ""}
        </Text>
        {kind === "company" && ageing ? (
          <AgeingBar ageDays={ageing.ageDays} bucket={ageing.bucket} />
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { flexDirection: "row", alignItems: "center", gap: space.xl },
  monogram: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  monogramText: { ...text.display("displayThree") },
  identity: { gap: space.xs },
  name: { color: theme.text, ...text.display("displayTwo") },
  meta: { color: theme.textMuted, ...text.ui("body") },
}));
