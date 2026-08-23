# No barrels and no inline JSX functions

## Outcome

The repository has no value- or type-export barrel files and no functions created inside JSX props. The repository gate rejects either pattern before a commit can pass `pnpm verify`.

The rule applies to application code, packages, tools, and tests. Package roots are not exceptions.

## Why

Barrels hide the module that supplies a value, enlarge import graphs, make circular dependencies easier to introduce, and make editor-generated imports unpredictable. A package needs a public API, but it does not need an `index.ts` aggregator: `package.json` can expose concrete modules directly.

Inline JSX functions create a new function identity on every render. They also hide behavior inside the rendered tree, where it is harder to name, inspect, and test.

The motivating barrel rationale is Dominik Dorfmeister's [Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files). This repository adopts the stricter choice discussed with the product owner: even package-root aggregators are removed.

## Enforcement

Enable these Biome performance rules globally as errors:

- `noBarrelFile`: refuses value re-export files.
- `noJsxPropsBind`: refuses arrow functions, function expressions, and `.bind()` calls in JSX props.

No path override exempts package roots, tests, or Expo routes. `pnpm check` already runs inside `pnpm verify`, so the existing gate and pre-commit hook enforce both rules.

Biome deliberately ignores type-only re-exports because they do not create a runtime module graph. A repository-wide architecture test closes that gap by refusing every direct re-export, including type-only forwarding. Public types are exported beside their concrete implementation modules and imported through explicit subpaths.

## Module exports and imports

Every workspace package exposes concrete source modules through its `package.json` `exports` map. Consumers import the module that owns the symbol, for example `@waltning/core/money` or `@waltning/ui/shell/card`, rather than a package or domain aggregator.

Existing `index.ts` files that only collect exports are deleted. An `index.ts` that is an executable or framework-owned entry module may keep its filename, but it must contain its own implementation and must not aggregate or forward exports.

Expo Router still needs unsuffixed route declarations. Each route becomes an ordinary module that imports its platform-resolved screen and exports that binding as its default; it does not re-export from another module.

The generated architecture rules must stop saying that only `index.ts` is public. The replacement rule is: only subpaths declared in a package's `exports` map are public, and every subpath resolves directly to the concrete module that owns the exported values.

## JSX handlers

All 47 current `noJsxPropsBind` findings are removed, including findings in tests.

Handlers that do not need captured render state become named module functions. Handlers that capture props, state, navigation inputs, or loop values become named functions in the component; use `useCallback` when stable identity crosses a component boundary. React Native style callbacks follow the same rule because they are JSX function props.

Tests use named no-op functions, spies, or local named capture functions instead of inline JSX callbacks.

This rule does not ban arrow functions elsewhere. Array transforms, promise continuations, state updaters, and other non-JSX callbacks remain legal.

## Migration shape

The PR is one atomic policy migration:

1. Enable both Biome rules and demonstrate the existing 36 barrel and 47 JSX-function diagnostics.
2. Replace package export maps and imports with explicit concrete subpaths.
3. Delete every aggregation barrel and convert Expo route entry modules.
4. Name every JSX callback without changing behavior.
5. Update the generated rule source and regenerate `AGENTS.md` and `CLAUDE.md` if both are generated outputs.
6. Run the full gate and all mobile platform exports.

Splitting configuration from cleanup is rejected because it leaves either an unmergeable rule-only commit or an interval where new violations can land. Compatibility aliases are also rejected: they preserve the hidden root imports the rule is meant to remove.

## Verification

- Break each rule deliberately and show `pnpm check` fail for the expected diagnostic.
- Run both Biome rules directly with a high diagnostic limit and confirm zero findings.
- Search for remaining aggregation `index.ts` files and inspect any executable/framework entrypoint that remains.
- Run `pnpm verify`.
- Run web, Android, and iOS Expo exports because package subpaths and route entry modules affect bundler resolution.

Behavior, product scope, persistence, and backend boundaries do not change in this PR.

## Mobile developer commands

The repository root exposes the mobile commands developers actually use:

- `pnpm dev:all` starts one Expo Go server for Android, iOS, and web.
- `pnpm dev:android`, `pnpm dev:ios`, and `pnpm dev:web` start and open one target.
- `pnpm bundle:android`, `pnpm bundle:ios`, and `pnpm bundle:web` export one target.
- `pnpm bundle:all` uses Expo's all-platform export for one complete output.

These are convenience entrypoints over the mobile package. The existing development-client and physical-device preview/install commands remain separate because they have different build semantics.
