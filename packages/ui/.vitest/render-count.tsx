import type { ComponentType } from "react";
import { useRef } from "react";

/**
 * Count how many times a component actually renders.
 *
 * **A re-render claim belongs in a test, not in a PR body.** "Rows do not
 * re-render when the strip's label changes" is a property with a number
 * behind it, and the number is the only part that survives someone editing
 * the component six months from now. `React.memo` on its own proves nothing:
 * it is a hint the reconciler is free to ignore, and it silently stops
 * working the moment a parent starts handing down a fresh object or arrow
 * each render — which is exactly the mistake nobody sees in review.
 *
 * Usage:
 *
 * ```tsx
 * const [Counted, renders] = counting(EntryRow);
 * const view = render(<List row={ROW} Row={Counted} />);
 * const before = renders.of(ROW.id);
 * view.rerender(<List row={ROW} Row={Counted} label="September" />);
 * expect(renders.of(ROW.id)).toBe(before); // the label is not the row's business
 * ```
 *
 * Counts are keyed so a list can be asserted per row rather than in
 * aggregate: a total that stayed flat can still hide one row re-rendering
 * while another stopped.
 */
export type RenderCounts = {
  /** How many times the instance under `key` has rendered. `0` if never. */
  of: (key: string) => number;
  /** Every render so far, all keys summed. */
  total: () => number;
  /** Forget everything — call between phases of a longer interaction. */
  reset: () => void;
};

/**
 * Wrap a component so each of its renders is counted under `keyOf(props)`.
 *
 * The count is incremented **during render**, deliberately: an effect would
 * miss a render React threw away, and a render that was thrown away still
 * cost the work this is here to measure.
 */
export function counting<Props extends object>(
  Component: ComponentType<Props>,
  keyOf: (props: Props) => string = () => "default",
): [ComponentType<Props>, RenderCounts] {
  const counts = new Map<string, number>();

  function Counted(props: Props) {
    const key = keyOf(props);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return <Component {...props} />;
  }
  Counted.displayName = `counting(${Component.displayName ?? Component.name ?? "Anonymous"})`;

  return [
    Counted,
    {
      of: (key) => counts.get(key) ?? 0,
      total: () => [...counts.values()].reduce((a, b) => a + b, 0),
      reset: () => counts.clear(),
    },
  ];
}

/**
 * The same measurement from inside a component, for a test that renders a
 * real tree rather than an injected one. Returns the render number, starting
 * at 1 — a component that has rendered once is not a component that has
 * re-rendered.
 */
export function useRenderNumber(): number {
  const n = useRef(0);
  n.current += 1;
  return n.current;
}
