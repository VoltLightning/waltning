/**
 * Summary's *Go to* (S04 §3) — the destinations that are not tabs.
 *
 * **Every card carries a figure**, which is the difference between a status
 * board and a menu. *Between us* as a tab was a word and an icon; here it is a
 * balance and a count, and that is the whole reason a low-frequency
 * destination is better off in this grid than in the bar.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import type { Gateway } from "./gateway-grid";
import { GatewayGrid } from "./gateway-grid";

function noop() {}

/** A plain stroke, so the stories do not depend on the icon set's shape. */
function Glyph() {
  return null;
}

const GATEWAYS: readonly Gateway[] = [
  { key: "debt", label: "Between us", detail: "+1 480,00 zł · 3 people", icon: <Glyph /> },
  { key: "categories", label: "Categories", detail: "12 used this month", icon: <Glyph /> },
  { key: "currencies", label: "Currencies", detail: "PLN · USD", icon: <Glyph /> },
  { key: "rates", label: "Exchange rates", detail: "USD/PLN today", icon: <Glyph /> },
];

const meta = {
  title: "Shell/GatewayGrid",
  component: GatewayGrid,
  args: { gateways: GATEWAYS, onSelect: noop },
} satisfies Meta<typeof GatewayGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Four destinations, two across. Three would wrap a five-word caption at 390pt. */
export const Four: Story = {};

/**
 * **A destination with nothing to say yet keeps its card and loses its line.**
 * A card with an empty line looks broken; one with no line at all has simply
 * not been given a figure, which is a different and honest thing.
 */
export const NothingToSayYet: Story = {
  args: { gateways: GATEWAYS.map((gateway) => ({ ...gateway, detail: null })) },
};

/**
 * **An odd card is a half-width card, not a full-width one.** `flexBasis`
 * rather than `flex: 1`, so the last row lines up with the ones above it.
 */
export const Three: Story = { args: { gateways: GATEWAYS.slice(0, 3) } };
