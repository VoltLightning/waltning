import { Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { GroundPanel } from "./card";
import { Shell } from "./shell";

export type TodayFrameProps = {
  appearanceAction: React.ReactNode;
  total: React.ReactNode;
  /** `Shell`'s `children` slot — `PeriodHeader` and the *spent* and *net* `StatTile`s (C2). */
  periodRow?: React.ReactNode;
  body: React.ReactNode;
};

/**
 * The ledger's own composition of `Shell`: `leading` is the "Today" heading
 * (the UI face — a headline is not a figure, and the display face exists for
 * figures), `trailing` is the appearance control, `hero` is the total.
 *
 * **The floating add button is not drawn here.** It used to be the frame's
 * last child, mounted and unmounted with every screen it sat on — which
 * remounted it, and its drag state, on every tab switch. `(tabs)/_layout.tsx`
 * now mounts it once, above the whole tab slot, wired to the same device
 * preference this frame used to carry as props (`floatPosition` /
 * `onFloatPositionChange` / `onAdd` / `addDisabled` are gone from
 * `TodayFrameProps` for that reason).
 */
export function TodayFrame({ appearanceAction, total, periodRow, body }: TodayFrameProps) {
  const t = useT();
  const styles = useStyles();

  return (
    <View style={styles.root}>
      <Shell
        leading={<Text style={styles.heading}>{t("shell.today")}</Text>}
        trailing={appearanceAction}
        hero={total}
      >
        {periodRow}
      </Shell>
      <GroundPanel>
        <View style={styles.body}>{body}</View>
      </GroundPanel>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.ground },
  heading: { color: theme.shellText, ...text.ui("displayTwo") },
  body: { flex: 1, gap: space.x3 },
}));
