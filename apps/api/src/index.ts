/**
 * Server entry point.
 *
 * Binds to loopback by default. The Pi reaches the tailnet through Caddy, and
 * nothing in this system is ever served on a public interface (§5.1) — a
 * default of `0.0.0.0` is one `docker run -p` away from being exactly that.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { BUILD } from "./config/build.ts";
import { createApp } from "./http/app.ts";

const rootEnv = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const port = Number(process.env["API_PORT"] ?? 3000);
// `BIND_ADDRESS`, the name .env.example has always used. This read was
// `API_HOST` — a name nothing defines — so an operator setting BIND_ADDRESS
// was silently ignored and the bind fell back to the default. It happened to
// be the same value, which is how a silent no-op survives review.
const hostname = process.env["BIND_ADDRESS"] ?? "127.0.0.1";

serve({ fetch: createApp().fetch, port, hostname }, (info) => {
  console.log(`waltning api  build=${BUILD}  http://${hostname}:${info.port}`);
});
