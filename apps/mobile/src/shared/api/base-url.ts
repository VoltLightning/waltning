/**
 * Where the API is, per surface.
 *
 * This is four different answers wearing one name, and getting it wrong is not
 * a crash — it is a client that quietly talks to nothing, or worse, to the
 * wrong thing:
 *
 * | Surface | Where the API is | Why |
 * |---|---|---|
 * | web, production | the page's own origin | Caddy serves the bundle and proxies `/trpc` (§5.1), so there is no second origin |
 * | web, dev | `http://localhost:3000` | Metro serves the bundle on `:8081`; the API is a separate process |
 * | simulator, dev | `http://127.0.0.1:3000` | the simulator shares the Mac's loopback |
 * | a real device | **must be stated** | loopback on a phone is the phone |
 *
 * The last row is the one worth the code. A device build that silently fell
 * back to `localhost` would find nothing, every time, and present as "the
 * server is down" — on the surface where that story is most plausible. So it
 * refuses to guess.
 *
 * Pure and platform-free on purpose: `react-native`'s `Platform` cannot be
 * imported by a Node test, and this is the part with the decisions in it.
 */

export type Surface = "web" | "native";

export type BaseUrlInputs = {
  /** `EXPO_PUBLIC_API_URL`, inlined into the bundle at build time. */
  configured: string | undefined;
  surface: Surface;
  /** Metro's `__DEV__`. */
  dev: boolean;
};

export class ApiBaseUrlError extends Error {}

/** The dev default, matching `API_PORT` in `.env.example`. */
const DEV_API = "http://localhost:3000";
const DEV_API_NATIVE = "http://127.0.0.1:3000";

/**
 * @returns an origin with no trailing slash, or `""` meaning "this page's own
 * origin" — which is a real answer on production web, not a missing one.
 */
export function resolveApiBaseUrl(inputs: BaseUrlInputs): string {
  // An explicit setting always wins, including in dev: it is how a real device
  // reaches a tailnet host, and how anyone points the app at a second machine.
  if (inputs.configured) return stripTrailingSlash(inputs.configured);

  // `""` is a real answer, not a missing one: it makes every request relative,
  // which is exactly right behind a reverse proxy that owns both paths.
  if (inputs.surface === "web") return inputs.dev ? DEV_API : "";

  if (inputs.dev) return DEV_API_NATIVE;

  throw new ApiBaseUrlError(
    "EXPO_PUBLIC_API_URL must be set for a native build. " +
      "Loopback on a device is the device, so there is no default that could work.",
  );
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}
