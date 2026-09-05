/**
 * `<UnsettledBanner>` — §8's unallocated clearing balance, worded.
 *
 * `S04` §3 draws it above Today's hero and `S01` §4 draws it beside
 * `WidgetGrid`; both are `Banner(warn)`, page-level, one action. This is the
 * wording half of that: `packages/client`'s `unsettledBannerModel` decides
 * *what is true* (which entry is oldest, whether its remainder differs from
 * the balance, how many other accounts are open), and this decides which of
 * the eight `shell.unsettled*` messages says it.
 *
 * **Eight messages, not one with holes.** Each of the three axes changes the
 * sentence rather than a placeholder inside it — an opening balance has no
 * payee to name, a differing remainder has two figures to state instead of
 * one, and a second unsettled account adds a count — and a message assembled
 * from fragments would translate into Polish as word order that is not Polish.
 *
 * **Money renders through `money.forDisplay`, not `<Amount>`**, because these
 * figures are inside a sentence: `<Amount>`'s tabular numerals and its
 * income/spend ink are for a column of figures, and an amount interpolated
 * mid-sentence has neither a column to align to nor a direction to colour.
 */

import * as money from "@waltning/core/money";
import { decimalMark } from "../i18n/locales.ts";
import { useLocale, useT } from "../i18n/provider";
import { Banner } from "../states/banner";

/**
 * Structurally declared rather than imported from `@waltning/client`:
 * `packages/ui` sits beside that package, not under it (`architecture/11`'s
 * floor), the same reason `TransactionRow` restates its own row shape.
 */
export type UnsettledBannerModel = {
  name: string;
  currency: string;
  decimals: number;
  balance: money.Money;
  remainder: money.Money;
  payee: string | null;
  isOpening: boolean;
  remainderDiffers: boolean;
  more: number;
};

export type UnsettledBannerProps = {
  /** `null` when nothing is unsettled — the banner is absent, not empty. */
  model: UnsettledBannerModel | null;
  onOpen: () => void;
  /**
   * The action's own word, when the screen's verb differs. S12 says *Allocate*
   * because that is the job in front of you on a debt screen; `S04`/`S01` say
   * *Open*, which is this prop's default. The route is the same either way.
   */
  actionLabel?: string | undefined;
};

export function UnsettledBanner({ model, onOpen, actionLabel }: UnsettledBannerProps) {
  const t = useT();
  const locale = useLocale();
  if (model === null) return null;

  const mark = decimalMark(locale);
  const remainder = money.forDisplay(model.remainder, model.decimals, mark);
  const amount = money.forDisplay(model.balance, model.decimals, mark);
  const namedKey = model.remainderDiffers
    ? model.more > 0
      ? "shell.unsettledNamedDiffersMore"
      : "shell.unsettledNamedDiffers"
    : model.more > 0
      ? "shell.unsettledNamedMore"
      : "shell.unsettledNamed";

  return (
    <Banner
      tone="warn"
      message={
        model.isOpening
          ? t(model.more > 0 ? "shell.unsettledOpeningMore" : "shell.unsettledOpening", {
              remainder,
              currency: model.currency,
              count: model.more,
            })
          : model.payee
            ? t(namedKey, {
                remainder,
                amount,
                currency: model.currency,
                payee: model.payee,
                count: model.more,
              })
            : t(model.more > 0 ? "shell.unsettledMore" : "shell.unsettled", {
                amount,
                currency: model.currency,
                account: model.name,
                count: model.more,
              })
      }
      action={{ label: actionLabel ?? t("shell.unsettledOpen"), onPress: onOpen }}
    />
  );
}
