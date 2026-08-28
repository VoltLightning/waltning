/**
 * `axe` as the page sees it, after `addScriptTag` injects the UMD bundle.
 *
 * Declared rather than imported: this describes a global that exists **inside
 * the browser**, injected at run time, and there is no module here to import it
 * from. Narrow to the one call the spec makes, so a second use has to say what
 * it needs rather than inheriting a permissive `any`.
 */

type AxeNode = { failureSummary?: string | null };
type AxeViolation = { id: string; nodes: AxeNode[] };

declare global {
  interface Window {
    axe: {
      run: (
        context: string,
        options: { runOnly: { type: "rule"; values: string[] } },
      ) => Promise<{ violations: AxeViolation[] }>;
    };
  }
}

export {};
