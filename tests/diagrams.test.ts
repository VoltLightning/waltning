/**
 * Mermaid diagrams, checked for the things that are cheap and certain.
 *
 * Actually parsing mermaid needs a DOM, which is a browser-sized dependency
 * inside a two-second gate. So this checks *shape* and says so: a diagram that
 * is semantically wrong still renders, and nothing here will notice.
 *
 * The colour rule is the one that came from an observed failure rather than
 * from imagination. A diagram was written with `fill:#eef` and a shaded
 * `rect rgb(240,240,240)`, which look right in a light editor — and on GitHub
 * in dark mode both became light boxes holding light text, effectively blank.
 * Nothing failed. The diagram rendered perfectly and could not be read, which
 * is this project's recurring shape: **the failure looks like health.**
 *
 * The repository's existing diagrams already had the answer — every `classDef`
 * with a fill also sets `color`, in a mid-tone that survives both themes. This
 * turns that convention into a check, because a convention nobody enforces is
 * a convention until the first person in a hurry.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

/** Every markdown file under docs/, plus the two at the root. */
function markdownFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(join(repoRoot, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) markdownFiles(rel, acc);
    else if (entry.name.endsWith(".md")) acc.push(rel);
  }
  return acc;
}

const files = [...markdownFiles("docs"), "README.md", "SPEC.md"];

/** Every fenced mermaid block in the documentation, as `{ file, body }`. */
const blocks: { file: string; body: string }[] = [];
for (const file of files) {
  const text = readFileSync(join(repoRoot, file), "utf8");
  for (const m of text.matchAll(/```mermaid\n([\s\S]*?)```/g)) {
    blocks.push({ file, body: m[1] ?? "" });
  }
}

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

describe("diagrams are well-formed", () => {
  it("opens each one with a known type", () => {
    const bad: string[] = [];
    for (const { file, body } of blocks) {
      const first =
        body
          .split("\n")
          .find((l) => l.trim())
          ?.trim() ?? "";
      if (!KINDS.some((k) => first.startsWith(k))) bad.push(`${file}: "${first}"`);
    }
    expect(bad, "unrecognised type — a typo here renders as an error box").toEqual([]);
  });

  it("balances quotes inside labels", () => {
    // An unclosed quote is the commonest way a hand-written diagram breaks,
    // and it swallows everything after it.
    const bad: string[] = [];
    for (const { file, body } of blocks) {
      for (const line of body.split("\n")) {
        if ((line.match(/"/g) ?? []).length % 2 !== 0) bad.push(`${file}: ${line.trim()}`);
      }
    }
    expect(bad, "odd number of quotes on a line").toEqual([]);
  });

  it("closes every subgraph in a flowchart", () => {
    const bad: string[] = [];
    for (const { file, body } of blocks) {
      const lines = body.split("\n").map((l) => l.trim());
      const first = lines.find(Boolean) ?? "";
      // Flowcharts only. `alt`, `rect` and `loop` also close with `end` in a
      // sequence diagram, so counting there would be wrong, not just noisy.
      if (!first.startsWith("graph") && !first.startsWith("flowchart")) continue;
      const opened = lines.filter((l) => l.startsWith("subgraph")).length;
      const closed = lines.filter((l) => l === "end").length;
      if (opened !== closed) bad.push(`${file}: ${opened} subgraph, ${closed} end`);
    }
    expect(bad, "a subgraph with no end swallows the rest of the diagram").toEqual([]);
  });
});

describe("diagrams survive both colour themes", () => {
  it("sets a text colour wherever it sets a fill", () => {
    const bad: string[] = [];
    for (const { file, body } of blocks) {
      for (const line of body.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("classDef")) continue;
        if (trimmed.includes("fill:") && !trimmed.includes("color:")) {
          bad.push(`${file}: ${trimmed}`);
        }
      }
    }
    expect(bad, "a fill without a color is unreadable in one theme or the other").toEqual([]);
  });

  it("shades sequence blocks with a translucent colour, never an opaque one", () => {
    // `rect rgb(240,240,240)` paints a light box that the dark theme then
    // writes light text onto. `rgba(...)` tints whatever is behind it instead,
    // so it works in both.
    const bad: string[] = [];
    for (const { file, body } of blocks) {
      for (const line of body.split("\n")) {
        const trimmed = line.trim();
        if (/^rect\s+rgb\(/.test(trimmed)) bad.push(`${file}: ${trimmed}`);
      }
    }
    expect(bad, "use rgba() so the shading tints rather than covers").toEqual([]);
  });
});

describe("the checks above are not vacuous", () => {
  it("actually found the diagrams", () => {
    // Every check above iterates one list. An empty list passes all of them.
    expect(blocks.length, "mermaid blocks located").toBeGreaterThan(30);
    expect(new Set(blocks.map((b) => b.file)).size, "files with diagrams").toBeGreaterThan(5);
  });

  it("recognises the failures it is looking for", () => {
    const classDefs = blocks.flatMap(({ body }) =>
      body.split("\n").filter((l) => l.trim().startsWith("classDef")),
    );
    // If no diagram styled anything, the colour rule would pass vacuously.
    expect(classDefs.length, "classDef lines present to check").toBeGreaterThan(5);
  });
});
