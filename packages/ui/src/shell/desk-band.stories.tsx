/**
 * `DeskBand` — `design-system/02` §2.10, `design-system/05` §5.1. A fixed
 * desk-width frame, matching `FloatingAdd`'s own fixed-frame stories: the
 * band fills its container's width, and a canvas as wide as its content
 * would be as wide as nothing.
 *
 * **1280, not the plan's 1440.** `playwright.config.ts`'s `chromium` project
 * re-spreads `devices["Desktop Chrome"]` in its own `use`, which carries that
 * device's own `viewport` — and a project's `use` wins over the file's
 * top-level `viewport: { width: 900, height: 600 }` on every key they share.
 * Every `layout: "fullscreen"` story is photographed at Desktop Chrome's
 * 1280, not the file's stated 900 — `Shell` and `FloatingAdd`'s own
 * baselines already are. A 1440 frame here would render correctly and then
 * get clipped at capture to whatever fits in 1280, which is a broken
 * baseline photographing a bug in the harness rather than the component.
 * 1280 still clears `breakpoint.desk` (1024) with room to spare; the harness
 * bug is worth its own fix, not a rider on this one.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { SegmentControl } from "../primitives/segment-control";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { CommandBarPlaceholder, CurrencyChip, DeskBand, DeskNavItem } from "./desk-band";
import { DualTotal } from "./dual-total";

const ROUTES = ["Today", "Ledger", "Calendar", "Debt"] as const;
const SCOPES = [
  { value: "all", label: "All" },
  { value: "mine", label: "Mine" },
  { value: "shared", label: "Shared" },
  { value: "business", label: "Business" },
] as const;

function Brand() {
  const styles = useStyles();
  return <Text style={styles.brand}>Waltning</Text>;
}

function NavDemoItem({
  route,
  active,
  onSelect,
}: {
  route: (typeof ROUTES)[number];
  active: boolean;
  onSelect: (route: (typeof ROUTES)[number]) => void;
}) {
  const handlePress = useCallback(() => onSelect(route), [onSelect, route]);
  return <DeskNavItem label={route} active={active} onPress={handlePress} />;
}

/** The whole composition a route would build — nav wired, scope local. */
function Composed({
  collapsed,
  initialRoute,
}: {
  collapsed: boolean;
  initialRoute: (typeof ROUTES)[number];
}) {
  const [active, setActive] = useState<(typeof ROUTES)[number]>(initialRoute);
  const [scope, setScope] = useState("all");

  return (
    <DeskBand
      brand={<Brand />}
      nav={ROUTES.map((route) => (
        <NavDemoItem key={route} route={route} active={route === active} onSelect={setActive} />
      ))}
      commandBar={<CommandBarPlaceholder />}
      currency={<CurrencyChip currency="PLN" />}
      scope={<SegmentControl segments={SCOPES} value={scope} onChange={setScope} tone="shell" />}
      hero={
        <DualTotal
          mine={money.toMoney("12480.20")}
          ours={money.toMoney("18940.60")}
          currency="PLN"
          size={collapsed ? "compact" : "band"}
        />
      }
      collapsed={collapsed}
    />
  );
}

const meta = {
  title: "Shell/DeskBand",
  component: DeskBand,
  // Every story below overrides this with `Composed`, which wires the nav
  // and the scope segment to local state — these satisfy the type only.
  args: {
    brand: <Brand />,
    nav: null,
    commandBar: <CommandBarPlaceholder />,
    currency: <CurrencyChip currency="PLN" />,
    scope: null,
    hero: <DualTotal mine={money.toMoney("12480.20")} ours={null} currency="PLN" size="band" />,
  },
  decorators: [withFrame],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof DeskBand>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The landing route: two rows — identity and command bar, then the hero (left) and scope (right). */
export const Expanded: Story = {
  render: () => <Composed collapsed={false} initialRoute="Today" />,
};

/** Every other route: one row — identity, the compact hero, a flexible gap, then command bar and scope. */
export const Collapsed: Story = {
  render: () => <Composed collapsed={true} initialRoute="Ledger" />,
};

function withFrame(Story: React.ComponentType) {
  return (
    <Frame>
      <Story />
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.frame}>{children}</View>;
}

const useStyles = makeStyles((theme) => ({
  brand: { color: theme.shellText, ...text.display("displayThree") },
  // 1280 — see the file doc for why, not the plan's 1440. A device
  // dimension, not a design-scale value, the same way `FloatingAdd`'s frame
  // is 390×640.
  frame: { width: 1280 },
}));
