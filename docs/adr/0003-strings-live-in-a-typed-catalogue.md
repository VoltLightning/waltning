# Strings live in a typed catalogue, and the compiler owns the keys

**Status:** accepted · 2026-09-01

Every user-visible string in this app comes from `packages/ui/src/i18n/`, a pair
of TypeScript catalogues. **`en.ts` is the source of truth for both the words
and the type**: `Messages` is a mapped type over it, so a language missing a key
does not compile and a language inventing one does not either.
`tests/architecture.test.ts` refuses a literal in a component, in either of the
two shapes a word reaches a screen — a prose prop (`label`, `placeholder`,
`title`, `accessibilityLabel`) and the text child of a `<Text>`.

The runtime is **`i18next` + `react-i18next`**, with `expo-localization` reading
the device's languages on the phone and `navigator.languages` in the browser.
`@formatjs/intl-pluralrules` is polyfilled on the device.

## Why a library at all, and why not Lingui

Plural rules are the part you cannot hand-roll responsibly. **Polish has four
plural categories where English has two**, and Polish is the language of ~96% of
this ledger's imported text (`architecture/07`). `Intl.PluralRules` is the
correct answer and every candidate library uses it, so the choice is not about
correctness — it is about what each one costs to build.

**Lingui is the better authoring experience and was rejected on build topology.**
Its macro extracts messages at compile time from the source text itself, which
removes the key-naming problem entirely. It needs a Babel macro plus
`@lingui/metro-transformer`. `packages/ui` is built by **two** bundlers — Metro
for the phone, Vite for Storybook and for vitest — so the macro is two pipelines
to configure and keep in step, and the failure when they drift is a test suite
that sees un-expanded macro calls. i18next needs no build step and behaves
identically under Metro, Vite, vitest and Node.

**`i18n-js`, which Expo's own guide uses, was rejected for the opposite reason:**
it has no type story. Keys are strings, a typo renders as itself, and the
catalogue stops being a contract. That is the failure mode this repository
already knows from `packages/ui`'s hardcoded colours — the version of a rule
that nothing checks.

## Why the catalogues are `.ts` and not `.json`

Because JSON cannot be a type. With a TypeScript catalogue the compiler answers
three questions that would otherwise need a linter, a script, or nobody:

- a language missing a key — `TS2741`, at the file that omitted it
- a key that no language defines — `t("shell.todya")` does not compile
- an interpolation variable that does not exist in the message

What the type cannot see, two tests do: a key that is present and **empty**
(`""` compiles and renders as a blank label), and a placeholder **renamed**
inside a translated string (`{{currency}}` → `{{waluta}}` is a valid `string`
and a sentence with a hole in it).

Nothing is fetched. The catalogues are bundled, the same call `fonts.ts` makes
and for the same reason: a phone with no signal must not render a fallback.

## The consequence that decided the timing

Localising the six screens that existed cost an afternoon. The board holds forty
more, and every string written before this rule is one to retrofit — found late,
by someone who does not read the language. The rule is worth more the earlier it
lands, which is the whole argument for landing it before the next screen rather
than after the last one.

## Two things this does not localise

**Money's group separator.** `design-system/04` §4.1 fixes it at U+00A0 for
every language, and gives the reason. Only the *decimal mark* follows the
reader. `Intl.NumberFormat` is deliberately not used for figures: it would take
the group separator with it, overturning a stated decision as a side effect of a
call nobody reads as one, and Hermes's implementation differs between Android
and iOS.

**Accounting dates.** They are bare `YYYY-MM-DD` strings end to end (§7.0a). A
localised date is a rendering, never a value.

## Related

- `architecture/11` §7 — the rule, and what enforces it
- `design-system/04` §4.1 — the separator, and the mark that moves
- `SPEC.md` §4.3 — the stack row
