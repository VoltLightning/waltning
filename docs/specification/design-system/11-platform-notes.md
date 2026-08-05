# Platform notes

One codebase via Expo + React Native Web (`SPEC.md` §14.6).

| Concern | Approach |
|---|---|
| Tokens | One TS module, consumed by RN `StyleSheet` and web CSS variables alike |
| Type | Figtree + Source Serif 4 via `expo-font`; web via the same families |
| Icons | `@phosphor-icons/react` (web) / `phosphor-react-native` — same names, one wrapper |
| Charts | ⚠️ The known RN Web friction point. `victory-native` renders both, but treemap and dense tables may need a web-only path |
| Tables | Import review and Reports are dense and keyboard-driven — most likely to force `apps/web` |
| Keyboard | J/K/A/R/S/T on import review is web-only; mobile uses swipe |
| Haptics | Approve, Save, Undo on native; no-op on web |

**Escape hatch:** if the dashboard fights RN Web, `apps/web` reuses these tokens
and the tRPC client. Building tokens as a shared module first is what keeps that
split cheap.
