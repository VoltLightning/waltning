/**
 * A pushed screen's header — the title, the line under it, and the way back.
 *
 * `PageHeader` is the band; this is the one line of platform that band needs,
 * and it lives here because `router.back()` is expo-router's
 * (`architecture/11`: an app is where a platform is named). Eleven screens
 * would otherwise each hand-roll the same `IconButton` around the same mark.
 *
 * **Beside the panel, never inside it.** `GroundPanel` scrolls and clears its
 * own sides and bottom, deliberately never the top; the header clears the
 * device inset once, on a `View` that does not move. A screen composes the two
 * as siblings.
 */

import { useT } from "@waltning/ui/i18n/provider";
import { IconButton } from "@waltning/ui/primitives/icon-button";
import { BackMark } from "@waltning/ui/shell/back-mark";
import { GroundPanel, type GroundPanelProps } from "@waltning/ui/shell/card";
import { PageHeader } from "@waltning/ui/shell/page-header";
import { router } from "expo-router";
import type { ReactNode } from "react";

/**
 * The way back, and where it goes when there is no back.
 *
 * A deep link (`waltning://settings/currencies`) and a typed URL in the web
 * build both open a screen with an empty history, and `router.back()` on an
 * empty stack does nothing at all — a labelled control that is the only
 * rendered exit and silently refuses. The platform's own header used to *hide*
 * its chevron in that case; a drawn mark has to decide instead, and the
 * decision is the ledger: every pushed screen in this app is reachable from
 * it, so it is never a worse answer than staying.
 */
function goBack() {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace("/");
}

export type PushedHeaderProps = {
  title: string;
  /** The deck gives every screen one; it says what the screen is for before a row is read. */
  subtitle?: string;
  /** `PageHeader`'s own — a band the page below continues. */
  tint?: string;
  /** `PageHeader`'s own — words drawn in the title's place. */
  titleNode?: ReactNode;
};

export function PushedHeader({ title, subtitle, tint, titleNode }: PushedHeaderProps) {
  const t = useT();

  return (
    <PageHeader
      title={title}
      {...(subtitle === undefined ? {} : { subtitle })}
      {...(tint === undefined ? {} : { tint })}
      {...(titleNode === undefined ? {} : { titleNode })}
      action={
        <IconButton label={t("common.back")} onPress={goBack}>
          <BackMark />
        </IconButton>
      }
    />
  );
}

export type PushedPageProps = PushedHeaderProps & {
  children: GroundPanelProps["children"];
  /** Passed straight through — a screen with its own virtualized list still needs `"own"`. */
  scroll?: GroundPanelProps["scroll"];
  /** Passed straight through — a header that folds as the page moves. */
  onScroll?: GroundPanelProps["onScroll"];
};

/**
 * The whole shape of a pushed screen: the band, then the scroller.
 *
 * Screens have several `GroundPanel`s — one per state — and each is a page
 * that needs the header. Composing them here means a state cannot be added
 * without one, which is how eleven screens ended up with a navigation band
 * nobody chose.
 */
export function PushedPage({
  title,
  subtitle,
  tint,
  titleNode,
  children,
  scroll,
  onScroll,
}: PushedPageProps) {
  return (
    <>
      <PushedHeader
        title={title}
        {...(subtitle === undefined ? {} : { subtitle })}
        {...(tint === undefined ? {} : { tint })}
        {...(titleNode === undefined ? {} : { titleNode })}
      />
      <GroundPanel
        {...(scroll === undefined ? {} : { scroll })}
        {...(onScroll === undefined ? {} : { onScroll })}
      >
        {children}
      </GroundPanel>
    </>
  );
}
