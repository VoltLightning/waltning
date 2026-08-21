/**
 * The theme layer — roles, the provider, and the stylesheet hook.
 *
 * Foundation rather than a domain: a role means the same thing in a ledger or a
 * chat client, which is the property `architecture/11` requires of anything
 * that lives beside `primitives/` and `fx/` rather than inside a domain.
 */

export { ThemeProvider, type ThemeProviderProps, useTheme } from "./provider";
export { light, type Theme, type ThemeName, themes } from "./roles.ts";
export { makeStyles, type Styles } from "./styles.ts";
