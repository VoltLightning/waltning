import { Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { GroundPanel } from "./card";
import { Shell } from "./shell";

export type TodayFrameProps = {
  appearanceAction: React.ReactNode;
  /** Under the heading — the device's own date, so the band says *when* as well as *what*. */
  date: string;
  body: React.ReactNode;
};

/**
 * The ledger's own composition of `Shell`: `leading` is the "Today" heading
 * over the device's date (the UI face — a headline is not a figure, and the
 * display face exists for figures), `trailing` is the appearance control, and
 * there is no `hero` — see the comment on the band below.
 *
 * **The floating add button is not drawn here.** It used to be the frame's
 * last child, mounted and unmounted with every screen it sat on — which
 * remounted it, and its drag state, on every tab switch. `(tabs)/_layout.tsx`
 * now mounts it once, above the whole tab slot, wired to the same device
 * preference this frame used to carry as props (`floatPosition` /
 * `onFloatPositionChange` / `onAdd` / `addDisabled` are gone from
 * `TodayFrameProps` for that reason).
 */
export function TodayFrame({ appearanceAction, date, body }: TodayFrameProps) {
  const t = useT();
  const styles = useStyles();

  return (
    <View style={styles.root}>
      {/*
        No `hero`. The band was carrying net worth and the period's figures —
        about 350pt of an 844pt screen — and everything the day actually
        changed started below the fold. Now it is a title, a date and the
        appearance control, and the ground begins where the content does.
      */}
      <Shell
        leading={
          <View style={styles.headingBlock}>
            <Text style={styles.heading}>{t("shell.today")}</Text>
            <Text style={styles.date}>{date}</Text>
          </View>
        }
        trailing={appearanceAction}
      />
      <GroundPanel>
        <View style={styles.body}>{body}</View>
      </GroundPanel>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.ground },
  headingBlock: { gap: space.xxs },
  heading: { color: theme.shellText, ...text.ui("displayTwo") },
  date: { color: theme.shellTextMuted, ...text.ui("bodySm") },
  // No `flex: 1` — this is `GroundPanel`'s sole child, and `flex: 1` there
  // gives it a `flexBasis` of `0`, which pins it to the viewport and defeats
  // both the panel's own scroll and its bottom clearance (H1).
  body: { gap: space.x3 },
}));
