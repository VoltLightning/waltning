/**
 * Metro, customized for exactly one reason: SQLite in the browser.
 *
 * `expo-sqlite` on web is wa-sqlite — a WASM build in a worker whose
 * synchronous API rides `SharedArrayBuffer`. That needs two things the
 * defaults don't provide:
 *
 * - **`.wasm` as an asset**, so the SQLite build ships in the bundle instead
 *   of failing resolution silently.
 * - **Cross-origin isolation on the dev server.** A browser only exposes
 *   `SharedArrayBuffer` to pages sent `Cross-Origin-Opener-Policy` and
 *   `Cross-Origin-Embedder-Policy`; without them the web ledger throws at
 *   startup. `docker/Caddyfile` sends the same pair in production —
 *   changing one means changing both.
 *
 * `require-corp` rather than `credentialless` because Safari never shipped
 * `credentialless`, and every asset this app loads is same-origin anyway.
 */

const http = require("node:http");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push("wasm");

/**
 * Why not `config.server.enhanceMiddleware`: it wraps only Metro's own
 * middleware, and the Expo CLI registers its route-HTML handler *ahead* of
 * that in the connect stack — so `/` (the document, the one response that
 * decides isolation) went out without the headers while `/index.html` got
 * them. This file is loaded by the CLI in the dev-server process before any
 * server exists, so the honest place left is the server itself: a listener
 * prepended on every `http.createServer` in this process, ahead of every
 * handler. Dev-only by construction — production headers live in
 * `docker/Caddyfile`.
 */
/**
 * `expo-sqlite`'s web module spawns `new Worker(new URL('./worker',
 * window.location.href))` — a request for `/worker` that nothing in the dev
 * server answers, so the SPA fallback hands the worker HTML and every sync
 * call times out. Metro can already bundle that file at its module path;
 * this rewrites the one URL onto it before any handler routes it.
 */
const SQLITE_WORKER_PATH = "/worker";
const SQLITE_WORKER_BUNDLE =
  "/apps/mobile/node_modules/expo-sqlite/web/worker.bundle" +
  "?platform=web&dev=true&transform.engine=hermes&unstable_transformProfile=hermes-stable";

const createServer = http.createServer.bind(http);
http.createServer = (...args) => {
  const server = createServer(...args);
  server.prependListener("request", (req, res) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    if (req.url === SQLITE_WORKER_PATH || req.url.startsWith(`${SQLITE_WORKER_PATH}?`)) {
      req.url = SQLITE_WORKER_BUNDLE;
    }
  });
  return server;
};

module.exports = config;
