/**
 * Runtime patches whose absence fails only on a device.
 *
 * `better-sqlite3` finalizes one-shot statements itself, so the ledger's real
 * transaction tests cannot reproduce Expo SQLite retaining a writing cursor
 * until `commit`. This pins the narrow upstream workaround at the
 * package-manager boundary: removing or weakening the patch must turn the
 * ordinary test gate red before a phone becomes the first place that exercises
 * it.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const drizzlePatch = join(repoRoot, "patches/drizzle-orm@0.45.2.patch");
const sqlitePatch = join(repoRoot, "patches/expo-sqlite@57.0.1.patch");
const workspace = join(repoRoot, "pnpm-workspace.yaml");

/**
 * The installed copy Metro actually bundles, through `apps/mobile`'s own
 * resolution and `realpathSync` past pnpm's symlink — never a hard-coded
 * `.pnpm` directory, whose name carries the patch hash and changes with the
 * patch.
 */
const expoSqliteUrl = pathToFileURL(
  realpathSync(join(repoRoot, "apps/mobile/node_modules/expo-sqlite")),
).href;

const expoDriverProbe = `
const { ExpoSQLiteSession } = require("drizzle-orm/expo-sqlite/session");
const { SQLiteSyncDialect } = require("drizzle-orm/sqlite-core");
const { sql } = require("drizzle-orm");

let finalizations = 0;
let completions = 0;
let firstReads = 0;
let failNext = false;
const result = {
  changes: 0,
  lastInsertRowId: 0,
  getAllSync() { return []; },
  getFirstSync() { return undefined; },
};

function returningResult() {
  const rows = [{ issued: 1 }, { issued: 2 }];
  const iterator = (function* () {
    for (const row of rows) yield row;
    completions += 1;
  })();
  return Object.assign(iterator, {
    changes: 1,
    lastInsertRowId: 1,
    getAllSync() {
      completions += 1;
      return rows;
    },
    getFirstSync() {
      firstReads += 1;
      return rows[0];
    },
  });
}

const client = {
  prepareSync(source) {
    return {
      executeSync() {
        if (failNext) {
          failNext = false;
          throw new Error("driver failure");
        }
        return source.includes("returning") ? returningResult() : result;
      },
      executeForRawResultSync() { return result; },
      finalizeSync() { finalizations += 1; },
    };
  },
};
const session = new ExpoSQLiteSession(client, new SQLiteSyncDialect(), undefined);

session.run(sql.raw("select 1"));
if (finalizations !== 1) throw new Error("a successful one-shot query was not finalized");

failNext = true;
try {
  session.run(sql.raw("select broken"));
} catch {}
if (finalizations !== 2) throw new Error("a failed one-shot query was not finalized");

const prepared = session.prepareQuery({ sql: "select reusable", params: [] }, undefined, "run", false);
prepared.run();
if (finalizations !== 2) throw new Error("an explicit prepared query was finalized after one use");

const returned = session.get(sql.raw("insert returning"));
if (returned.issued !== 1) throw new Error("a one-shot get did not return its first row");
if (completions !== 1) throw new Error("a one-shot get left its writing cursor in progress");
if (firstReads !== 0) throw new Error("a one-shot get stopped at its first returning row");
if (finalizations !== 3) throw new Error("a completed one-shot get was not finalized");

const reusableGet = session.prepareQuery(
  { sql: "select reusable returning", params: [] },
  undefined,
  "get",
  false,
);
const reusableRow = reusableGet.get();
if (reusableRow.issued !== 1) throw new Error("a reusable get did not return its first row");
if (completions !== 2) throw new Error("a reusable get left its cursor in progress");
if (finalizations !== 3) throw new Error("a reusable get was finalized after one use");
`;

/**
 * Run with `--import tsx`: `WorkerChannel.ts` is TypeScript with
 * extension-less relative imports, which plain Node ESM cannot resolve.
 */
const workerChannelProbe = `
globalThis.__DEV__ = false;
const channel = await import(process.env.CHANNEL_URL);

// A worker that answers synchronously: \`invokeWorkerSync\` posts, this stores
// the result into the shared buffer before \`postMessage\` returns, and the
// Atomics spin therefore exits on its first read.
const worker = {
  postMessage(message) {
    const thrown = new Error('NoModificationAllowedError: pool is held');
    thrown.name = 'NoModificationAllowedError';
    thrown.code = 'SQLITE_BUSY';
    channel.sendWorkerResult({
      id: message.id,
      result: null,
      error: thrown,
      syncTrait: { lockBuffer: message.lockBuffer, resultBuffer: message.resultBuffer },
    });
  },
};

let caught = null;
try {
  channel.invokeWorkerSync(worker, 'open', {});
} catch (e) {
  caught = e;
}
if (!caught) throw new Error('the channel swallowed a worker failure');
console.log(JSON.stringify({ name: caught.name, message: caught.message, code: caught.code }));
`;

/**
 * The other half of the same channel. Run with `--import tsx` for the same
 * reason as the probe above.
 */
const workerChannelAsyncProbe = `
globalThis.__DEV__ = false;
const channel = await import(process.env.CHANNEL_URL);

// The worker as \`worker.ts\`'s own \`self.onmessage\` writes it: \`result\` is
// undefined for a void operation — \`open\`, \`close\`, \`exec\`, every
// \`session*\` call — \`error\` is null, and there is no syncTrait.
const posted = [];
globalThis.self = { postMessage: (message) => posted.push(message) };

function workerFor(error) {
  return {
    postMessage(message) {
      channel.sendWorkerResult({ id: message.id, result: null, error });
      const sent = posted.pop();
      queueMicrotask(() => channel.workerMessageHandler({ data: { ...sent, isSync: false } }));
    },
  };
}

async function outcomeOf(error) {
  try {
    return { resolved: true, value: await channel.invokeWorkerAsync(workerFor(error), 'open', {}) };
  } catch (e) {
    return { resolved: false, name: e.name, message: e.message, code: e.code };
  }
}

const refusal = new Error('NoModificationAllowedError: pool is held');
refusal.name = 'NoModificationAllowedError';
refusal.code = 'SQLITE_BUSY';

console.log(JSON.stringify({ success: await outcomeOf(null), failure: await outcomeOf(refusal) }));
`;

/** Plain Node ESM: every import under `wa-sqlite/` carries its `.js`. */
const accessHandlePoolProbe = `
const { AccessHandlePoolVFS } = await import(process.env.VFS_URL);

/** Enough of \`FileSystemSyncAccessHandle\` for the pool's own header reads. */
class FakeAccessHandle {
  constructor(file) {
    this.file = file;
    this.closed = false;
  }
  read(view, { at = 0 } = {}) {
    const out = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    const src = this.file.bytes.subarray(at, Math.min(this.file.bytes.length, at + out.length));
    out.set(src);
    return src.length;
  }
  write(view, { at = 0 } = {}) {
    const src = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    if (at + src.length > this.file.bytes.length) {
      const grown = new Uint8Array(at + src.length);
      grown.set(this.file.bytes);
      this.file.bytes = grown;
    }
    this.file.bytes.set(src, at);
    return src.length;
  }
  truncate(size) {
    const next = new Uint8Array(size);
    next.set(this.file.bytes.subarray(0, Math.min(size, this.file.bytes.length)));
    this.file.bytes = next;
  }
  flush() {}
  getSize() {
    return this.file.bytes.length;
  }
  close() {
    this.closed = true;
  }
}

const files = [
  { name: 'aaa', bytes: new Uint8Array(0), refuse: false },
  // Still held by the document being replaced.
  { name: 'bbb', bytes: new Uint8Array(0), refuse: true },
  { name: 'ccc', bytes: new Uint8Array(0), refuse: false },
];
const handles = [];

function fileHandle(file) {
  return {
    kind: 'file',
    async createSyncAccessHandle() {
      if (file.refuse) {
        const error = new Error('The access handle is already held.');
        error.name = 'NoModificationAllowedError';
        throw error;
      }
      const handle = new FakeAccessHandle(file);
      handles.push(handle);
      return handle;
    },
  };
}

const directory = {
  kind: 'directory',
  async getFileHandle(name) {
    let file = files.find((f) => f.name === name);
    if (!file) {
      file = { name, bytes: new Uint8Array(0), refuse: false };
      files.push(file);
    }
    return fileHandle(file);
  },
  async getDirectoryHandle() {
    return directory;
  },
  async removeEntry(name) {
    const index = files.findIndex((f) => f.name === name);
    if (index >= 0) files.splice(index, 1);
  },
  async *[Symbol.asyncIterator]() {
    for (const file of files) yield [file.name, fileHandle(file)];
  },
};

Object.defineProperty(globalThis, 'navigator', {
  value: { storage: { getDirectory: async () => directory } },
  configurable: true,
});

let refusal = null;
try {
  await AccessHandlePoolVFS.create('expo-sqlite', {});
} catch (e) {
  refusal = e;
}
if (!refusal) throw new Error('a held pool did not refuse the first acquisition');
if (refusal.name !== 'NoModificationAllowedError') {
  throw new Error('the refusal lost its identity: ' + refusal.name);
}

const leaked = handles.filter((handle) => !handle.closed);
if (leaked.length > 0) {
  throw new Error(leaked.length + ' access handle(s) left open by a failed acquisition');
}

// The other document has gone. The pool must now be acquirable.
files[1].refuse = false;
const vfs = await AccessHandlePoolVFS.create('expo-sqlite', {});
if (vfs == null) throw new Error('a second attempt did not build a VFS');

// A slot is one OPFS file, and \`jOpen\` refuses a path it has no slot for
// with \`SQLITE_CANTOPEN\` — permanently, since nothing tops the pool up
// afterwards. Six was the upstream number and this app's own peak is six.
if (vfs.getCapacity() < 16) {
  throw new Error('pool capacity is ' + vfs.getCapacity() + ', below this app own peak plus room');
}

// An install created under the old capacity has to grow, not stay small: the
// directory here already held three files before the first acquisition.
if (files.length < 16) throw new Error('an existing pool directory was not topped up');
console.log('ok');
`;

describe("the Expo SQLite Drizzle patch", () => {
  it("completes every get and finalizes only one-shot statements", () => {
    const patch = readFileSync(drizzlePatch, "utf8");
    const workspaceConfig = readFileSync(workspace, "utf8");

    expect(patch).toContain("prepareOneTimeQuery(");
    expect(patch).toContain("isOneTime");
    expect(patch).toContain("finally");
    expect(patch).toContain("this.stmt.finalizeSync()");
    expect(workspaceConfig).toContain("drizzle-orm@0.45.2: patches/drizzle-orm@0.45.2.patch");

    expect(() =>
      execFileSync(process.execPath, ["-e", expoDriverProbe], {
        cwd: dirname(join(repoRoot, "apps/mobile/package.json")),
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});

/**
 * The browser's half. `Uint8Array.prototype.set(new Uint32Array([n]))` copies
 * one *element* coerced to a byte, so the main thread read `n & 0xFF` as the
 * result length and any synchronous result over 255 bytes came back cut off —
 * "Unterminated string in JSON" the moment the outbox held two rows. Nothing
 * under Node exercises a `SharedArrayBuffer` worker channel, so the pin is the
 * patch's text: the byte-accurate write present, the element-wise one gone.
 */
describe("the Expo SQLite web channel patch", () => {
  it("writes the sync result length as four bytes, not one", () => {
    const patch = readFileSync(sqlitePatch, "utf8");
    const workspaceConfig = readFileSync(workspace, "utf8");

    expect(patch).toContain("+    new DataView(resultBuffer).setUint32(0, length, true);");
    expect(patch).toContain("-    resultArray.set(new Uint32Array([length]), 0);");
    expect(workspaceConfig).toContain("expo-sqlite@57.0.1: patches/expo-sqlite@57.0.1.patch");
  });

  /**
   * **The `[object Object]` startup screen, reproduced.** `serialize` is
   * `JSON.stringify` and an `Error` has no own enumerable properties, so
   * `serialize({ error })` was `{"error":{}}`; the main thread deserialised
   * `{}` and `new Error({})` gave the message `"[object Object]"`. Every
   * synchronous failure in the browser — a held OPFS pool included — arrived
   * saying nothing.
   *
   * The probe drives the **real, patched** module: a fake worker whose
   * `postMessage` answers synchronously through `sendWorkerResult`, so
   * `invokeWorkerSync`'s `Atomics` spin resolves on its first read and the
   * whole round trip runs under Node with no browser. Pointed at the
   * unpatched build it prints `{"name":"Error","message":"[object Object]"}`,
   * which is why this is a reproduction rather than a restatement.
   */
  it("carries a worker error's name, message and code across the sync channel", () => {
    const stdout = execFileSync(process.execPath, ["--import", "tsx", "-e", workerChannelProbe], {
      cwd: repoRoot,
      env: { ...process.env, CHANNEL_URL: `${expoSqliteUrl}/web/WorkerChannel.ts` },
      stdio: "pipe",
      encoding: "utf8",
    });

    expect(JSON.parse(stdout.trim())).toEqual({
      name: "NoModificationAllowedError",
      message: "NoModificationAllowedError: pool is held",
      code: "SQLITE_BUSY",
    });
  });

  /**
   * **The half a text pin cannot see.** `sendWorkerResult`'s asynchronous
   * branch keyed on `result` being truthy, which was harmless only while a
   * failure was posted as a bare `null` — most worker operations return
   * nothing at all, and `false` and `null` are ordinary results. Posting a
   * *described* error down that branch made every successful async call
   * reject with "unknown worker failure": the readiness gate's own
   * `openDatabaseAsync(":memory:")` could never succeed, so every browser
   * load ran the whole backoff and learned nothing. It failed silently — the
   * app still started, two seconds later.
   *
   * Both directions in one probe, because keying on the wrong variable breaks
   * exactly one of them and a test that checks only failures stays green.
   */
  it("resolves a void async result and rejects a described async failure", () => {
    const stdout = execFileSync(
      process.execPath,
      ["--import", "tsx", "-e", workerChannelAsyncProbe],
      {
        cwd: repoRoot,
        env: { ...process.env, CHANNEL_URL: `${expoSqliteUrl}/web/WorkerChannel.ts` },
        stdio: "pipe",
        encoding: "utf8",
      },
    );

    expect(JSON.parse(stdout.trim())).toEqual({
      success: { resolved: true, value: null },
      failure: {
        resolved: false,
        name: "NoModificationAllowedError",
        message: "NoModificationAllowedError: pool is held",
        code: "SQLITE_BUSY",
      },
    });
  });
});

/**
 * The browser's other half: **a document that loses the race for the OPFS
 * access-handle pool has to be able to try again.**
 *
 * The pool is acquired for the whole directory at once, per worker, and the
 * worker is a module singleton that is never terminated — so an acquisition
 * that failed used to be permanent for the life of the page. Two things made
 * it so, and the patch fixes both: `worker.ts` assigned `_sqlite3` before the
 * VFS existed, after which every later call fell through to
 * `Invalid VFS state`; and `AccessHandlePoolVFS` acquired its handles with
 * `Promise.all`, which rejects on the first refusal while the rest are still
 * in flight, leaving handles open inside an instance nothing can reach —
 * so the next attempt was blocked by us rather than by whoever held the pool.
 */
describe("the Expo SQLite pool-acquisition patch", () => {
  /**
   * A deterministic reproduction, against the real patched file: a fake OPFS
   * directory of three files whose middle one refuses its access handle the
   * way a browser does while another document holds it. Against the unpatched
   * build the probe reports two handles left open.
   */
  it("releases what a failed acquisition took, and acquires on the next attempt", () => {
    const stdout = execFileSync(process.execPath, ["-e", accessHandlePoolProbe], {
      cwd: repoRoot,
      env: { ...process.env, VFS_URL: `${expoSqliteUrl}/web/wa-sqlite/AccessHandlePoolVFS.js` },
      stdio: "pipe",
      encoding: "utf8",
    });

    expect(stdout.trim().endsWith("ok")).toBe(true);
  });

  /**
   * `worker.ts` imports the wasm binary, so no probe under Node can reach it.
   * The pin is the patch's text: the trio published only once all three
   * exist, and every step *after* the pool is acquired inside a `try` that
   * closes the VFS on the way out — `vfs_register` and `MemoryVFS.create` can
   * both throw, and the handles a local holds are handles nothing else can
   * give back.
   */
  it("leaves no half-built VFS behind for the next attempt to trip over", () => {
    const patch = readFileSync(sqlitePatch, "utf8");

    // The bug: `_sqlite3` assigned before the VFS that may throw.
    expect(patch).toContain("-    _sqlite3 = SQLite.Factory(module) as SQLiteAPI;");
    // The fix: locals, published as a trio only once all three exist.
    expect(patch).toContain("+  _sqlite3 = sqlite3;");
    expect(patch).toContain("+  _vfs = vfs;");
    expect(patch).toContain("+  _vfsMemory = vfsMemory;");
    // And the acquisition is released on any throw that follows it.
    expect(patch).toContain("+  let vfs: AccessHandlePoolVFS | null = null;");
    expect(patch).toContain("+      await vfs?.close();");
    // The reachable partial state is the one guarded — no dead reset of a
    // trio that is only ever all-null or all-set.
    expect(patch).not.toContain("releaseVfsAsync");
  });
});
