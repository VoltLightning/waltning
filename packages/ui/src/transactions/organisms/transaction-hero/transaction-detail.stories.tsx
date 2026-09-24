/** S09 assembled at phone and desk widths, using the same detail components. */
import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { toMoney } from "@waltning/core/money";
import { View } from "react-native";
import { Button } from "../../../primitives/atoms/button/button";
import { PageHeader } from "../../../shell/molecules/page-header/page-header";
import { makeStyles } from "../../../theme/styles.ts";
import { gutter, space } from "../../../tokens.ts";
import { FieldsCard } from "../fields-card/fields-card";
import fieldsMeta from "../fields-card/fields-card.stories";
import { LinesCard } from "../lines-card/lines-card";
import { TransactionHero } from "./transaction-hero";

function noop() {}

function DetailPreview({ phone }: { phone: boolean }) {
  const styles = useStyles();
  return (
    <View style={phone ? styles.phone : styles.desk}>
      <PageHeader title="Café A" subtitle="6 Aug 2026" />
      <View style={styles.body}>
        <TransactionHero
          amount={toMoney("-48.90")}
          currency="PLN"
          type="expense"
          accountName="Cash"
          enteredName="Café A"
          brandKey={null}
        />
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
  body: { maxWidth: 680 + gutter * 2, padding: gutter, gap: space.x3 },
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
