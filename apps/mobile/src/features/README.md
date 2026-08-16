# `features/` — one folder per product capability

The primary axis, as on the server. A feature owns its screens' building
blocks, its state, and its data access.

```
features/transactions/
  index.ts                  the feature's public API
  ui/
    atoms/                  only if the feature owns a primitive nothing else needs
    molecules/              TransactionRow, AmountField
    organisms/              TransactionList, CaptureSheet
  model/                    state, derived values, formatters
  api/                      tRPC hooks for this feature's operations
```

**Atomic design is a scale *inside* a module, not a filing cabinet for the
whole app.** Three global folders named atoms/molecules/organisms answer "what
size is this component" and never "what is it for" — so every feature's pieces
end up mixed together and nothing can be moved or deleted as a unit. The tiers
belong here, where they describe composition within one bounded thing.

A component earns a place in `shared/ui` (or `@waltning/ui`) by being used by a
second feature — not by looking generic. Promotion is a deliberate move, and
the design system says which components exist at all
(`docs/specification/design-system/`); a screen never invents one.

**Features do not import each other.** Compose them in `app/` — the expo-router
tree — which is the only layer that fetches and the only place a screen exists.
