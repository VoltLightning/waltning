# `shared/` — used by more than one feature, knows about none of them

The test is not "does this look reusable" but "is it used twice". Something
here may never import a feature; if it needs to, it belongs in that feature.

- `ui/` — app-level components that are not part of the cross-app design
  system in `@waltning/ui`. Same atomic tiers, same reasoning.
- `lib/` — pure helpers with no React and no domain.
- `hooks/` — cross-feature React hooks.

Money formatting is not here: it is `@waltning/core`'s `money.ts`, because the
server needs the identical implementation.
