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
import { createApp } from "./app.ts";
import { BUILD } from "./build.ts";

const rootEnv = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const port = Number(process.env["API_PORT"] ?? 3000);
const hostname = process.env["API_HOST"] ?? "127.0.0.1";

serve({ fetch: createApp().fetch, port, hostname }, (info) => {
  console.log(`waltning api  build=${BUILD}  http://${hostname}:${info.port}`);
});
