/**
 * S19's home tab — the list of everything Settings leads to.
 *
 * **Accounts is first**, because S16 §2 names Settings as its entry ("From
 * Settings · Accounts") and, until it was listed here, the register was
 * reachable only by typing a URL or by finishing an account creation that
 * started somewhere else.
 *
 * **No title, and no card built here.** A title on the only card on a screen
 * names the screen rather than the card, and the screen's name belongs to the
 * header above the ground — not to a heading drawn inside the panel. The card
 * of rows is `SettingsMenu`'s (`packages/ui/src/settings`) — a screen
 * composes, it does not render.
 */

import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { useT } from "@waltning/ui/i18n/provider";
import {
  SettingsMenu,
  type SettingsMenuGlyph,
  type SettingsMenuItem,
} from "@waltning/ui/settings/settings-menu";
import { GroundPanel } from "@waltning/ui/shell/card";
import { text } from "@waltning/ui/theme/fonts";
import { makeStyles } from "@waltning/ui/theme/styles";
import { radius, space } from "@waltning/ui/tokens";
import { router } from "expo-router";
import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";

/**
 * Every destination, keyed by its own `routes.*` label — so the menu's order
 * and its wording are one declaration, and neither can drift from the other.
 * The routes stay literal because expo-router types them: a `string` here
 * would not compile, which is the check catching a typo.
 */
const ROUTES = {
  accounts: "/accounts",
  categories: "/settings/categories",
  currencies: "/settings/currencies",
  rates: "/settings/rates",
  backup: "/settings/backup",
} as const;

type Destination = keyof typeof ROUTES;

/**
 * **Three groups, separated by a gap — `S30`'s own shape.** The reference data
 * the ledger is written in, then the money's own money, then what leaves the
 * app. The deck spends no heading on them: a gap says *these belong together*
 * and costs no words.
 *
 * `glyph` names what the row *is*, never the shape — a row renamed does not
 * strand an icon called `creditCard` on a screen about something else.
 */
const GROUPS = [
  [
    { id: "accounts", glyph: "accounts" },
    { id: "categories", glyph: "categories" },
  ],
  [
    { id: "currencies", glyph: "currencies" },
    { id: "rates", glyph: "rates" },
  ],
  [{ id: "backup", glyph: "backup" }],
] as const satisfies readonly (readonly { id: Destination; glyph: SettingsMenuGlyph }[])[];

export default function Settings() {
  const t = useT();
  const styles = useStyles();
  const ledger = useLedgerController();
  const snapshot = usePhoneLedger(ledger);

  /**
   * The line under each label — the one fact that answers the question which
   * sends you into the screen. **Read from the ledger, never guessed:** a row
   * with nothing true to say yet renders the label alone, which is what
   * `value` being optional is for.
   */
  const values = useMemo((): Partial<Record<Destination, string>> => {
    const accounts = snapshot.accounts.length;
    const currencies = snapshot.currencies.length;
    return {
      ...(accounts > 0 ? { accounts: t("settings.accountsValue", { count: accounts }) } : {}),
      ...(currencies > 0
        ? { currencies: t("settings.currenciesValue", { count: currencies }) }
        : {}),
    };
  }, [snapshot.accounts, snapshot.currencies, t]);

  const groups = useMemo(
    (): readonly (readonly SettingsMenuItem<Destination>[])[] =>
      GROUPS.map((group) =>
        group.map((row) => ({
          id: row.id,
          glyph: row.glyph,
          label: t(`routes.${row.id}`),
          ...(values[row.id] === undefined ? {} : { value: values[row.id] as string }),
        })),
      ),
    [t, values],
  );

  // No runtime guard: `SettingsMenu` is generic in its id type, so what comes
  // back is one of the four keys above and the compiler carries it. A row
  // with a typo'd id is a type error rather than a tap that does nothing.
  const handleSelect = useCallback((id: Destination) => router.push(ROUTES[id]), []);

  return (
    <GroundPanel>
      <SettingsMenu groups={groups} onSelect={handleSelect} />
      {/*
        `S30`'s closing note. Not a card — a quiet inset block on the ground,
        stating the one thing about this app a person cannot see anywhere
        else: nothing has left the phone. It is true while there is no
        backend, and it is where pairing will be offered when there is.
      */}
      <View style={styles.note}>
        <Text style={styles.noteTitle}>{t("settings.onThisPhoneTitle")}</Text>
        <Text style={styles.noteBody}>{t("settings.onThisPhoneBody")}</Text>
      </View>
    </GroundPanel>
  );
}

const useStyles = makeStyles((theme) => ({
  note: {
    backgroundColor: theme.insetFill,
    borderRadius: radius.md,
    padding: space.x2,
    paddingHorizontal: space.x3,
    gap: space.xxs,
  },
  noteTitle: { color: theme.text, ...text.ui("label", 600) },
  noteBody: { color: theme.textMuted, ...text.ui("caption", 400) },
}));
