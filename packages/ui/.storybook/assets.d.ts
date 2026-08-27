/**
 * Vite's `?url` asset imports, declared so `tsc` can see them.
 *
 * `tsconfig.client.json` sets `noUncheckedSideEffectImports`, and this package
 * is typechecked by `tsc --noEmit` rather than by the bundler — so an import
 * Vite resolves at build time and TypeScript has never heard of is an error
 * here, correctly. This is the declaration that makes it one it can check
 * rather than one it must be told to ignore.
 *
 * Narrow on purpose: `.ttf?url` and nothing else. A wildcard over every asset
 * type would type the whole class as `string` and hide the next import that
 * genuinely has no loader behind it.
 */

declare module "*.ttf?url" {
  const url: string;
  export default url;
}
