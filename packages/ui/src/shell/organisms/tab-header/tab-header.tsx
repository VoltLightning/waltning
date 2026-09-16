/**
 * `<TabHeader>` — the band every tab root but Today wears (`05-composites`
 * §5.1): the tab's own name, the line under it, and room for one action.
 *
 * **It is `PageHeader` with no way back.** A tab root is somewhere to be, not
 * somewhere to leave, so the corner holds an action or nothing. Everything
 * else — the clearance, the two type steps, the ground it sits on — is the
 * same band every pushed screen wears, and this file used to hold a third
 * copy of it painted in `shell`.
 *
 * **On the ground, not the sage.** The deck's S16 and S30 open with the name
 * in ink on cream, the same cream the cards sit on; the green band was this
 * app's invention, and it made Today — the one tab that had no band — the one
 * tab that looked like the design. Drawn by the tab shell from the active
 * tab's label, never by the screen, so no tab screen carries a title of its
 * own: a screen that draws its own header is a screen that can disagree with
 * the next one.
 */

import type { ReactNode } from "react";
import { PageHeader } from "../../molecules/page-header/page-header";

export type TabHeaderProps = {
  title: string;
  /** The deck gives every tab root one — *Everything about how this behaves*. */
  subtitle?: string;
  /** **One** action, on the right — a period label, a filter. Never three. */
  action?: ReactNode;
};

export function TabHeader({ title, subtitle, action }: TabHeaderProps) {
  return (
    <PageHeader
      title={title}
      {...(subtitle === undefined ? {} : { subtitle })}
      {...(action === undefined ? {} : { action })}
    />
  );
}
