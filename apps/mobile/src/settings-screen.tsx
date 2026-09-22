/**
 * S19's home tab — the list of everything Settings leads to.
 *
 * **Accounts is first**, because S16 §2 names Settings as its entry ("From
 * Settings · Accounts") and, until it was listed here, the register was
 * reachable only by typing a URL or by finishing an account creation that
 * started somewhere else.
 *
 * **Appearance and Language open a sheet, not a screen.** Each is one choice
 * from a handful, and the choice takes effect behind the sheet as it is made —
 * a screen of its own would hide the very thing being changed.
 *
 * **No title, and no card built here.** A title on the only card on a screen
 * names the screen rather than the card, and the screen's name belongs to the
 * header above the ground — not to a heading drawn inside the panel. The card
 * of rows is `SettingsMenu`'s (`packages/ui/src/settings`) — a screen
 * composes, it does not render.
 */

import type { AppearancePreference } from "@waltning/client/appearance/create-appearance";
import { useAppearance } from "@waltning/client/appearance/use-appearance";
import { useDevicePreference } from "@waltning/client/device/use-device-preference";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { daysBetween, todayIn } from "@waltning/core/date";
import {
  dayLabel,
  isLocale,
  LANGUAGE_NAMES,
  type LanguagePreference,
  LOCALES,
  type Locale,
  resolveLocale,
} from "@waltning/ui/i18n/locales";
import { useLocale, useT } from "@waltning/ui/i18n/provider";
import { BottomSheet } from "@waltning/ui/primitives/bottom-sheet";
import { RadioGroup, type RadioOption } from "@waltning/ui/primitives/radio";
import {
  SettingsMenu,
  type SettingsMenuGlyph,
  type SettingsMenuItem,
} from "@waltning/ui/settings/settings-menu";
import { GroundPanel } from "@waltning/ui/shell/card";
import { Banner } from "@waltning/ui/states/banner";
import { text } from "@waltning/ui/theme/fonts";
import { makeStyles } from "@waltning/ui/theme/styles";
import { radius, space } from "@waltning/ui/tokens";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Text, useColorScheme, View } from "react-native";
import {
  appearance,
  DEVICE_LOCALES,
  language,
  lastBackup,
  PREVIEW_RESET_ENABLED,
} from "./platform";

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
  restore: "/settings/restore",
  developer: "/settings/developer",
} as const;

type Destination = keyof typeof ROUTES;

/** Rows that open a sheet on this screen rather than a route. */
type Choice = "appearance" | "language";

type Row = Destination | Choice;

function isChoice(id: Row): id is Choice {
  return id === "appearance" || id === "language";
}

// Split so the option list is a non-empty tuple by construction, as
// `RadioGroup` requires: one option is not a choice.
const [FIRST_LOCALE, ...OTHER_LOCALES] = LOCALES;

function languageOption(locale: Locale): RadioOption {
  return { value: locale, label: LANGUAGE_NAMES[locale] };
}

function isAppearancePreference(value: string): value is AppearancePreference {
  return value === "system" || value === "light" || value === "dark";
}

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
  [
    { id: "backup", glyph: "backup" },
    { id: "restore", glyph: "restore" },
  ],
  // How this phone shows the ledger — device preferences, never synced.
  [
    { id: "appearance", glyph: "appearance" },
    { id: "language", glyph: "language" },
  ],
] as const satisfies readonly (readonly { id: Row; glyph: SettingsMenuGlyph }[])[];

/** Appended only in a build that carries `PREVIEW_RESET_ENABLED`. */
const DEVELOPER_GROUP = [{ id: "developer", glyph: "developer" }] as const satisfies readonly {
  id: Row;
  glyph: SettingsMenuGlyph;
}[];

export default function Settings() {
  const t = useT();
  const locale = useLocale();
  const styles = useStyles();
  const ledger = useLedgerController();
  const snapshot = usePhoneLedger(ledger);
  const systemScheme = useColorScheme();
  const shown = useAppearance(
    appearance,
    systemScheme === "light" || systemScheme === "dark" ? systemScheme : null,
  );
  const chosenLanguage = useDevicePreference(language).value ?? "system";
  /** The day the last backup was taken, kept on this phone (`backup-screen.tsx`). */
  const backupTaken = useDevicePreference(lastBackup).value;
  const [sheet, setSheet] = useState<Choice | null>(null);
  const [appearanceFailed, setAppearanceFailed] = useState(false);

  /**
   * The line under each label — the one fact that answers the question which
   * sends you into the screen. **Read from the ledger, never guessed:** a row
   * with nothing true to say yet renders the label alone, which is what
   * `value` being optional is for.
   */
  const values = useMemo((): Partial<Record<Row, string>> => {
    const accounts = snapshot.accounts.length;
    const currencies = snapshot.currencies.length;
    // Categories something is filed under — the number that says whether the
    // taxonomy is being used, not how big it is.
    let inUse = 0;
    for (const count of snapshot.categoryUsage.values()) if (count > 0) inUse += 1;
    // The stalest last quote among the currencies that have any — the one
    // fact that sends you into Exchange rates.
    const today = todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
    let oldest: number | null = null;
    for (const row of ledger.readCoverage(today)) {
      if (row.lastDate === null) continue;
      const age = daysBetween(row.lastDate, today);
      if (oldest === null || age > oldest) oldest = age;
    }
    const themeWord = t(shown.theme === "dark" ? "settings.dark" : "settings.light");
    const phoneLanguage = LANGUAGE_NAMES[resolveLocale(DEVICE_LOCALES)];
    return {
      appearance:
        shown.preference === "system"
          ? t("settings.followPhoneValue", { value: themeWord })
          : themeWord,
      language:
        chosenLanguage === "system"
          ? t("settings.followPhoneValue", { value: phoneLanguage })
          : LANGUAGE_NAMES[chosenLanguage],
      ...(accounts > 0 ? { accounts: t("settings.accountsValue", { count: accounts }) } : {}),
      ...(inUse > 0 ? { categories: t("settings.categoriesValue", { count: inUse }) } : {}),
      ...(currencies > 0
        ? { currencies: t("settings.currenciesValue", { count: currencies }) }
        : {}),
      ...(backupTaken === null
        ? {}
        : { backup: t("settings.backupTaken", { date: dayLabel(backupTaken, locale) }) }),
      ...(oldest === null
        ? {}
        : {
            rates:
              oldest === 0
                ? t("settings.ratesCurrent")
                : t("settings.ratesOldest", { count: oldest }),
          }),
    };
  }, [
    ledger,
    snapshot.accounts,
    snapshot.currencies,
    snapshot.categoryUsage,
    t,
    shown.theme,
    shown.preference,
    chosenLanguage,
    backupTaken,
    locale,
  ]);

  /**
   * The development group, and **the gate is the row itself**.
   *
   * A production build has no door to that screen rather than a door into an
   * empty one — the same flag the reset has always carried, read in one place
   * so a second screen cannot forget it.
   */
  const visible = useMemo(
    () => (PREVIEW_RESET_ENABLED ? [...GROUPS, DEVELOPER_GROUP] : GROUPS),
    [],
  );

  const groups = useMemo(
    (): readonly (readonly SettingsMenuItem<Row>[])[] =>
      visible.map((group) =>
        group.map((row) => ({
          id: row.id,
          glyph: row.glyph,
          label: isChoice(row.id) ? t(`settings.${row.id}`) : t(`routes.${row.id}`),
          ...(values[row.id] === undefined ? {} : { value: values[row.id] as string }),
        })),
      ),
    [t, values, visible],
  );

  // No runtime guard: `SettingsMenu` is generic in its id type, so what comes
  // back is one of the keys above and the compiler carries it. A row with a
  // typo'd id is a type error rather than a tap that does nothing.
  const handleSelect = useCallback((id: Row) => {
    if (isChoice(id)) setSheet(id);
    else router.push(ROUTES[id]);
  }, []);
  const handleDismiss = useCallback(() => {
    setSheet(null);
    setAppearanceFailed(false);
  }, []);

  const appearanceOptions = useMemo(
    (): readonly [RadioOption, RadioOption, ...RadioOption[]] => [
      {
        value: "system",
        label: t("settings.followPhone"),
        hint: t("settings.followPhoneHint", {
          value: t(systemScheme === "dark" ? "settings.dark" : "settings.light"),
        }),
      },
      { value: "light", label: t("settings.light") },
      { value: "dark", label: t("settings.dark") },
    ],
    [t, systemScheme],
  );
  // Each language in itself, so a phone set to one the reader does not know
  // can still be put back (`LANGUAGE_NAMES`).
  const languageOptions = useMemo(
    (): readonly [RadioOption, RadioOption, ...RadioOption[]] => [
      {
        value: "system",
        label: t("settings.followPhone"),
        hint: t("settings.followPhoneHint", {
          value: LANGUAGE_NAMES[resolveLocale(DEVICE_LOCALES)],
        }),
      },
      languageOption(FIRST_LOCALE),
      ...OTHER_LOCALES.map(languageOption),
    ],
    [t],
  );

  const handleAppearance = useCallback((next: string) => {
    if (!isAppearancePreference(next)) return;
    setAppearanceFailed(false);
    appearance.setPreference(next).catch(handleAppearanceFailure);
    function handleAppearanceFailure() {
      setAppearanceFailed(true);
    }
  }, []);
  const handleLanguage = useCallback((next: string) => {
    const preference: LanguagePreference | null = next === "system" || isLocale(next) ? next : null;
    if (preference !== null) void language.set(preference);
  }, []);

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
      {/*
        The sheet stays open after a pick: the change is already behind it —
        the page darkens, or its words change language — and seeing that is
        how you know it took.
      */}
      <BottomSheet
        visible={sheet !== null}
        title={t(sheet === "language" ? "settings.language" : "settings.appearance")}
        onDismiss={handleDismiss}
      >
        {sheet === "language" ? (
          <RadioGroup
            label={t("settings.language")}
            options={languageOptions}
            value={chosenLanguage}
            onChange={handleLanguage}
          />
        ) : (
          <View style={styles.sheet}>
            <RadioGroup
              label={t("settings.appearance")}
              options={appearanceOptions}
              value={shown.preference}
              onChange={handleAppearance}
            />
            {appearanceFailed ? (
              <Banner tone="negative" message={t("settings.appearanceFailed")} />
            ) : null}
          </View>
        )}
      </BottomSheet>
    </GroundPanel>
  );
}

const useStyles = makeStyles((theme) => ({
  sheet: { gap: space.x3 },
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
