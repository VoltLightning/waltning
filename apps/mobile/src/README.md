# `src/` — the platform, and nothing else

This directory holds what **names a platform**: `Platform.OS`, `__DEV__`,
`EXPO_PUBLIC_*`. Today that is one file, `platform.ts`, and the manifesto
(`docs/specification/architecture/11-client-architecture.md`) is the argument
for keeping it that way.

Everything else that a screen needs lives in a package and is imported:

| You want | It is in |
|---|---|
| A hook, the tRPC client, base-URL resolution, build comparison | `@waltning/client` |
| A component, a token | `@waltning/ui` |
| Money, protocol, contracts | `@waltning/core` |

**If a file you are about to add here does not import `react-native`, `expo-*`
or a router, it belongs in a package.** `tests/architecture.test.ts` will say so
before you get as far as a review.

This folder previously described a `ui/ lib/ hooks/` layout. It never had one,
and the layout it needed turned out to be a package.
