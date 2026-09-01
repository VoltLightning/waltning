/**
 * `<I18nProvider>` — the language as a value, not a module constant.
 *
 * The same shape `theme/provider.tsx` takes, for the same reasons: a language
 * resolved at import time is a language fixed at build time, and every hook in
 * this package takes its dependencies as parameters rather than reaching for a
 * singleton (`architecture/11`).
 *
 * **A component rendered with no provider still renders English**, and that is
 * deliberate rather than a fallback. The population of call sites that
 * legitimately have no provider is large and growing — every render test, every
 * story, every diff preview — and a throw there would buy nothing and cost a
 * wrapper at each one. `theme/provider.tsx` makes the identical call.
 *
 * **The default instance is the only one registered globally.** Instances the
 * provider builds are handed to `<I18nextProvider>` explicitly and never call
 * `initReactI18next`, so mounting a Polish tree in one test cannot change what
 * an unwrapped component renders in the next.
 */

import i18next, { createInstance, type i18n as I18nInstance, type TFunction } from "i18next";
import { useMemo } from "react";
import { I18nextProvider, initReactI18next, useTranslation } from "react-i18next";
import type { en } from "./en.ts";
import { catalogues, isLocale, type Locale } from "./locales.ts";

/**
 * **This is what makes `t()` typed.** Without the augmentation every key is
 * `string`, a typo renders as itself, and the catalogue stops being a contract
 * — which is the failure mode a folder of JSON files has and the reason these
 * are TypeScript. With it, `t("shell.todya")` does not compile, and neither
 * does passing `{ code }` to a message whose placeholder is `{{currency}}`.
 */
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof en };
  }
}

const resources = {
  en: { translation: catalogues.en },
  pl: { translation: catalogues.pl },
};

function configure(instance: I18nInstance, locale: Locale): I18nInstance {
  void instance.init({
    lng: locale,
    fallbackLng: "en",
    resources,
    // React escapes what it renders; i18next escaping first would render
    // `&#39;` in every message with an apostrophe — and English has several.
    interpolation: { escapeValue: false },
    // Resources are inline, so there is nothing to load. Left at its default
    // i18next defers loading into a `setTimeout` and the first render happens
    // before init resolves — which shows raw keys for one frame on every cold
    // start. (`initImmediate` in i18next ≤25; renamed and inverted in 26.)
    initAsync: false,
  });
  return instance;
}

/**
 * The instance an unwrapped component reads.
 *
 * **`initReactI18next` is what registers it**, and that is not obvious:
 * initialising `i18next` is not the same as telling `react-i18next` about it.
 * Without this call `useTranslation` outside a provider warns
 * `NO_I18NEXT_INSTANCE` and every component renders its keys — `Held
 * separately — not a total.` becomes `shell.heldSeparately` in every test,
 * story and diff preview that does not wrap a provider, which is nearly all of
 * them.
 *
 * It is the **only** instance registered globally, which is why the provider's
 * own instances deliberately do not call it: `setI18n` is a global write, so a
 * Polish tree mounted in one test would otherwise decide what an unwrapped
 * component renders in the next.
 */
export const defaultI18n: I18nInstance = configure(i18next.use(initReactI18next), "en");

export type I18nProviderProps = {
  /** Which shipped language to render. */
  locale?: Locale;
  children: React.ReactNode;
};

export function I18nProvider({ locale = "en", children }: I18nProviderProps) {
  // Memoised on the locale: a new instance on every parent render would
  // re-initialise i18next and hand every consumer a new `t`.
  const instance = useMemo(
    () => (locale === "en" ? defaultI18n : configure(createInstance(), locale)),
    [locale],
  );

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}

/**
 * The translator — **and the reason components import it from here rather than
 * from `react-i18next` directly.**
 *
 * `defaultI18n` above is created when this module is first imported, and
 * nothing else imports it. A component calling `react-i18next`'s
 * `useTranslation` therefore reached an unregistered i18next and rendered its
 * own keys: `Save` became `common.save` in every test, story and diff preview
 * that did not happen to pull the provider in — 22 of them, and each one a
 * screenshot nobody would look at twice.
 *
 * Importing the translator *is* importing the module, so the default instance
 * cannot be missing at the moment it is needed. `tests/architecture.test.ts`
 * keeps the seam shut by refusing a direct `react-i18next` import outside this
 * file.
 */
export function useT(): TFunction {
  return useTranslation().t;
}

/**
 * The active language, narrowed.
 *
 * `i18n.language` is a `string` and can carry a region (`pl-PL`) or a language
 * nothing shipped. Every caller needs a `Locale` — `decimalMark` is a total
 * function over that union and would otherwise need a default at each call
 * site, which is where the mark would quietly become a dot again.
 */
export function useLocale(): Locale {
  const { i18n } = useTranslation();
  const primary = i18n.language?.split("-")[0]?.toLowerCase() ?? "";
  return isLocale(primary) ? primary : "en";
}
