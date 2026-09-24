/** S09 assembled at phone and desk widths, using the same detail components. */
import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { yearMonth } from "@waltning/core/date";
import { toMoney } from "@waltning/core/money";
import { View } from "react-native";
import { Button } from "../../../primitives/atoms/button/button";
import { PageHeader } from "../../../shell/molecules/page-header/page-header";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { gutter, space } from "../../../tokens.ts";
import { ContextStrip, type ContextStripCard } from "../context-strip/context-strip";
import { FieldsCard } from "../fields-card/fields-card";
import fieldsMeta from "../fields-card/fields-card.stories";
import { LinesCard } from "../lines-card/lines-card";
import { heroTint, TransactionHero } from "./transaction-hero";

function noop() {}

const MONTHS = ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];
const CAFE = ["110.20", "64.00", "121.50", "98.00", "142.10", "186.40"];

const CARDS: readonly ContextStripCard[] = [
  {
    kind: "who",
    name: "Café A",
    months: MONTHS.map((month, index) => ({
      month: yearMonth(month),
      total: toMoney(CAFE[index] ?? "0"),
    })),
    count: 4,
    share: toMoney("48.90"),
    currency: "PLN",
    decimals: 2,
    onOpenAll: noop,
  },
  {
    kind: "category",
    name: "Eating out",
    month: yearMonth("2026-08"),
    spent: toMoney("312.60"),
    usual: toMoney("402.10"),
    share: toMoney("48.90"),
    currency: "PLN",
    decimals: 2,
  },
];

function DetailPreview({ phone }: { phone: boolean }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={phone ? styles.phone : styles.desk}>
      <PageHeader title="6 Aug 2026" tint={heroTint("Eating out", theme).fill} />
      <View style={styles.body}>
        <TransactionHero
          amount={toMoney("-48.90")}
          currency="PLN"
          type="expense"
          accountName="Cash"
          enteredName="Café A"
          brandKey={null}
          categoryName="Eating out"
        />
        <ContextStrip cards={CARDS} />
        <FieldsCard {...fieldsMeta.args} />
        <LinesCard lines={[]} total={toMoney("48.90")} currency="PLN" onSave={noop} />
        <View style={styles.deleteAction}>
          <Button label="Delete" onPress={noop} variant="danger" />
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  phone: { width: 390, maxWidth: "100%" },
  desk: { width: "100%" },
  body: { paddingTop: space.x2, paddingHorizontal: gutter, paddingBottom: gutter, gap: space.x3 },
  deleteAction: { alignItems: "flex-start", paddingTop: space.xl },
}));

const meta = {
  title: "Transactions/TransactionDetail",
  component: DetailPreview,
  parameters: { layout: "fullscreen" },
  args: { phone: false },
} satisfies Meta<typeof DetailPreview>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Desk: Story = {};
export const Phone: Story = { args: { phone: true } };
