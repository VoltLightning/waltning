/**
 * The tab shell. **The only file allowed to name `expo-router`'s tabs
 * primitives** — `<TabList>`, `<TabSlot>`, `<Tabs>`, `<TabTrigger>`.
 * `../../src/tabs-shell.tsx` renders the platform-neutral furniture around
 * them — the phone's `<TabBar>` and floating button, or `DESK1`'s
 * `<DeskBand>` — and this file is what binds it to the router: `slot` is the
 * one primitive `<TabsShell>` cannot construct itself and place is all it
 * does with it.
 *
 * `<TabList>` is real but invisible (`style={styles.hiddenList}`): its
 * `<TabTrigger>`s are what register the five routes with the router, and
 * `useTabBarItems` (`../../src/use-tab-bar-items.tsx` — a route defines no
 * hooks) reads them back by name to drive both the phone's `<TabBar>` and,
 * at desk width, `DeskBand`'s nav — the pattern `expo-router/ui`'s docs call
 * a fully custom tab bar.
 *
 * **Four routes, and Calendar is not one of them.** S11 is unbuilt, and the
 * placeholder that stood in for it was a real route with a real trigger and
 * no way to reach it — no tab target, no header and no selected tab in the
 * bar, because nothing in the shell knew about it any more. A route nobody
 * can arrive at and nothing can render correctly is worse than an absent
 * one, so the screen and its trigger are gone; S11 adds both back together.
 *
 * **The `+` is not a tab, and it does not exist at desk width at all.** On
 * the phone it floats, mounted once inside `<TabsShell>` — above the whole
 * `<TabSlot>`, not per-screen — so it survives a tab switch instead of
 * remounting (and losing its drag state). At desk width `02-tokens` §2.10's
 * command-bar slot is where `+` lives instead.
 */

import { makeStyles } from "@waltning/ui/theme/styles";
import { TabList, TabSlot, Tabs, TabTrigger } from "expo-router/ui";
import { TabsShell } from "../../src/tabs-shell";

export default function TabsLayout() {
  const styles = useStyles();

  return (
    <Tabs>
      <TabsShell slot={<TabSlot />} />
      <TabList style={styles.hiddenList}>
        <TabTrigger name="today" href="/" />
        <TabTrigger name="ledger" href="/ledger" />
        <TabTrigger name="debt" href="/debt" />
        <TabTrigger name="settings" href="/settings" />
      </TabList>
    </Tabs>
  );
}

const useStyles = makeStyles(() => ({
  // The registering triggers, not the visible bar — `<TabsShell>` draws
  // that. `display: "none"` rather than omitting `<TabList>`: the router
  // still needs it mounted to know the five routes exist.
  hiddenList: { display: "none" },
}));
