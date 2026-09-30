/**
 * `<RenderBoundary>` — **a render error shows a recoverable screen, never a
 * blank one** (`architecture/11` §8c).
 *
 * React unmounts the whole tree when a render throws and nothing above it
 * catches. On a phone that is the window's own white with no way out but
 * killing the app; the ledger underneath is fine, and the person cannot know
 * that. This is the one catch, placed around the navigator so every screen is
 * under it.
 *
 * **Retry mounts the children afresh.** A `key` that changes on every retry
 * discards the subtree that threw, so the next attempt starts from the
 * route's own initial state rather than from whatever state made it throw.
 * That is also why the boundary does not try to "reset" in place.
 *
 * `onError` is how the error reaches Diagnostics: `packages/ui` names no
 * logger, so the app hands one in (`_layout.tsx`).
 *
 * A class, because React has no hook for this — `getDerivedStateFromError` is
 * the only way to catch a child's render.
 */

import { Component, type ErrorInfo, Fragment, type ReactNode } from "react";
import { RenderFailed } from "../render-failed/render-failed";

export type RenderBoundaryProps = {
  children: ReactNode;
  /** Receives the thrown value and React's component stack, once per failure. */
  onError?: (error: Error, componentStack: string) => void;
};

type State = { error: Error | null; attempt: number };

export class RenderBoundary extends Component<RenderBoundaryProps, State> {
  override state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info.componentStack ?? "");
  }

  private handleRetry = () => {
    this.setState((current) => ({ error: null, attempt: current.attempt + 1 }));
  };

  override render() {
    if (this.state.error !== null) return <RenderFailed onRetry={this.handleRetry} />;
    // The key is what makes a retry a fresh mount.
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}
