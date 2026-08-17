/**
 * The wiki is published from `docs/wiki/`, and this is what stands behind it.
 *
 * A GitHub wiki is a *separate git repository*. The pre-commit hook — which is
 * the only automated gate this project has — cannot run there, so a page
 * written directly in the wiki UI reaches a public surface with no
 * personal-data sweep, no formatting, and nothing checking its links. Keeping
 * the source here puts it back under the gate; these tests are the part of the
 * gate that is specific to the wiki.
 *
 * Two failures are worth naming, because neither is visible in review:
 *
 * 1. **Relative links silently retarget.** `[x](../../SPEC.md)` is correct in
 *    the repository and, once published, resolves against the *wiki* — where
 *    that file does not exist. It renders as a link and 404s on click. So every
 *    link out of a page must be absolute, and this checks that.
 * 2. **A deep link outlives the file it names.** Renaming a screen document
 *    leaves the wiki pointing at a path that no longer exists, and nothing in
 *    the repository's own tests would notice.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const wikiRoot = join(repoRoot, "docs/wiki");

/** `_Sidebar` and `_Footer` are chrome GitHub renders around every page. */
const CHROME = new Set(["_Sidebar.md", "_Footer.md"]);

const pageFiles = readdirSync(wikiRoot).filter((f) => f.endsWith(".md"));
const contentPages = pageFiles.filter((f) => !CHROME.has(f));
const read = (f: string) => readFileSync(join(wikiRoot, f), "utf8");
const text = new Map(pageFiles.map((f) => [f, read(f)]));

/** GitHub maps a wiki page title to its file by replacing spaces with hyphens. */
const pageFileFor = (title: string) => `${title.trim().replace(/ /g, "-")}.md`;

const WIKI_LINK = /\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g;
const MD_LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;
const REPO_URL = "https://github.com/VoltLightning/waltning/";

function wikiLinksIn(t: string): string[] {
  return [...t.matchAll(WIKI_LINK)].map((m) => (m[1] ?? "").trim());
}

function mdTargetsIn(t: string): string[] {
  // Fenced code blocks hold mermaid and shell, not links.
  const withoutCode = t.replace(/```[\s\S]*?```/g, "");
  return [...withoutCode.matchAll(MD_LINK)].map((m) => m[1] ?? "");
}

describe("wiki pages link to pages that exist", () => {
  it("resolves every [[wiki link]] to a page file", () => {
    const dangling: string[] = [];
    for (const [file, t] of text) {
      for (const title of wikiLinksIn(t)) {
        if (!pageFiles.includes(pageFileFor(title))) {
          dangling.push(`${file} → [[${title}]] (expected ${pageFileFor(title)})`);
        }
      }
    }
    expect(dangling, "wiki links with no page").toEqual([]);
  });

  it("leaves no page unreachable from Home or the sidebar", () => {
    const entry = `${text.get("Home.md") ?? ""}\n${text.get("_Sidebar.md") ?? ""}`;
    const reachable = new Set(wikiLinksIn(entry).map(pageFileFor));
    const orphans = contentPages.filter((f) => f !== "Home.md" && !reachable.has(f));
    expect(orphans, "pages nothing navigates to").toEqual([]);
  });
});

describe("wiki pages link out absolutely", () => {
  /**
   * The whole class of bug this file exists for. A relative target is valid in
   * the repository and broken once published, and it renders identically.
   */
  it("uses no relative link target", () => {
    const relative: string[] = [];
    for (const [file, t] of text) {
      for (const target of mdTargetsIn(t)) {
        if (target.startsWith("http://") || target.startsWith("https://")) continue;
        if (target.startsWith("#") || target.startsWith("mailto:")) continue;
        relative.push(`${file} → ${target}`);
      }
    }
    expect(relative, "relative links break once published — use the full URL").toEqual([]);
  });

  it("points every repository link at a path that exists", () => {
    const missing: string[] = [];
    for (const [file, t] of text) {
      for (const target of mdTargetsIn(t)) {
        if (!target.startsWith(REPO_URL)) continue;
        const rest = target.slice(REPO_URL.length);
        const m = /^(?:blob|tree)\/main\/([^#?]+)/.exec(rest);
        if (!m?.[1]) continue; // the bare repo URL, or a non-file link
        const path = decodeURIComponent(m[1]).replace(/\/$/, "");
        if (!existsSync(join(repoRoot, path))) missing.push(`${file} → ${path}`);
      }
    }
    expect(missing, "wiki links to repository paths that do not exist").toEqual([]);
  });
});

/**
 * Mermaid diagrams, checked for shape rather than meaning.
 *
 * A diagram that does not parse renders as a red error box on a public page,
 * and it looks perfectly fine in the source. Actually parsing mermaid needs a
 * DOM, which is a browser-sized dependency inside a two-second gate — so this
 * checks the three things that are cheap and certain, and claims nothing more.
 * A semantically wrong diagram still renders, and no test here will say so.
 */
describe("mermaid diagrams are at least well-formed", () => {
  const KINDS = [
    "graph",
    "flowchart",
    "sequenceDiagram",
    "stateDiagram-v2",
    "erDiagram",
    "classDiagram",
    "gantt",
    "journey",
    "pie",
  ];

  /** Each fenced mermaid block, as `{ page, body }`. */
  const blocks: { page: string; body: string }[] = [];
  for (const [file, t] of text) {
    for (const m of t.matchAll(/```mermaid\n([\s\S]*?)```/g)) {
      blocks.push({ page: file, body: m[1] ?? "" });
    }
  }

  it("closes every mermaid fence", () => {
    const unclosed: string[] = [];
    for (const [file, t] of text) {
      const opens = (t.match(/```mermaid/g) ?? []).length;
      const closes = (t.match(/```/g) ?? []).length;
      // Every fence, mermaid or not, needs a partner.
      if (closes % 2 !== 0) unclosed.push(`${file}: ${closes} fence markers`);
      if (opens > closes / 2) unclosed.push(`${file}: unclosed mermaid block`);
    }
    expect(unclosed, "unbalanced code fences").toEqual([]);
  });

  it("opens each diagram with a known type", () => {
    const bad: string[] = [];
    for (const { page, body } of blocks) {
      const first =
        body
          .split("\n")
          .find((l) => l.trim())
          ?.trim() ?? "";
      if (!KINDS.some((k) => first.startsWith(k))) bad.push(`${page}: "${first}"`);
    }
    expect(bad, "unrecognised mermaid diagram type — a typo here renders as an error box").toEqual(
      [],
    );
  });

  it("balances quotes inside labels", () => {
    // An unclosed quote in a node label is the single most common way a
    // hand-written diagram breaks, and it swallows the rest of the diagram.
    const bad: string[] = [];
    for (const { page, body } of blocks) {
      for (const line of body.split("\n")) {
        if ((line.match(/"/g) ?? []).length % 2 !== 0) bad.push(`${page}: ${line.trim()}`);
      }
    }
    expect(bad, "odd number of quotes on a line").toEqual([]);
  });

  it("closes every subgraph in a flowchart", () => {
    const bad: string[] = [];
    for (const { page, body } of blocks) {
      const lines = body.split("\n").map((l) => l.trim());
      const first = lines.find(Boolean) ?? "";
      // Only flowcharts, where `end` closes a subgraph and nothing else.
      // `alt`/`rect`/`loop` also end in sequence diagrams, so counting there
      // would be wrong rather than merely noisy.
      if (!first.startsWith("graph") && !first.startsWith("flowchart")) continue;
      const opened = lines.filter((l) => l.startsWith("subgraph")).length;
      const closed = lines.filter((l) => l === "end").length;
      if (opened !== closed) bad.push(`${page}: ${opened} subgraph, ${closed} end`);
    }
    expect(bad, "a subgraph with no end swallows the rest of the diagram").toEqual([]);
  });
});

describe("the checks above are not vacuous", () => {
  /** Each assertion here would go quietly true if an extractor broke. */
  it("finds pages, wiki links and markdown targets", () => {
    expect(contentPages.length).toBeGreaterThan(5);
    expect(pageFiles).toContain("Home.md");
    expect(wikiLinksIn("see [[Money and FX]] and [[Home|the top]]")).toEqual([
      "Money and FX",
      "Home",
    ]);
    expect(pageFileFor("Money and FX")).toBe("Money-and-FX.md");
    expect(mdTargetsIn("[a](https://x/y) and ```\n[b](c)\n```")).toEqual(["https://x/y"]);
    // Home genuinely carries links of both kinds, so a silent regex failure
    // above cannot pass by finding nothing.
    expect(wikiLinksIn(text.get("Home.md") ?? "").length).toBeGreaterThan(5);
    expect(mdTargetsIn(text.get("Home.md") ?? "").length).toBeGreaterThan(0);
  });

  it("finds the diagrams it claims to be checking", () => {
    // The diagram checks iterate a list. An empty list passes all of them.
    const found = [...text.values()].reduce((n, t) => n + (t.match(/```mermaid/g) ?? []).length, 0);
    expect(found, "mermaid blocks located").toBeGreaterThan(15);
  });
});
