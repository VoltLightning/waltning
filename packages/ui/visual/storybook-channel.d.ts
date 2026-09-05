/**
 * The preview's own event channel, as the page sees it — Storybook's own
 * `Channel`, installed as a page global once the preview bundle boots
 * (`storybook/dist/preview/runtime.js`'s `channel-slot`). Declared rather
 * than imported for the same reason `axe.d.ts` is: this is a runtime global
 * a browser bundle creates, not a module this spec can import from.
 *
 * **Three overloads of `.last`, one per event name `stories.spec.ts` reads —
 * never a generic `string` overload returning `unknown[]`.** Every call site
 * already knows which event it is asking for; the return type might as well
 * know too, and a real signature is what let `stories.spec.ts` drop its own
 * `as` casts and this file's entry in `tests/unknown-budget.test.ts`.
 * `playFunctionThrewException` and `storyThrewException` each carry
 * Storybook's own serialized-error shape (`serializeError`,
 * `preview/runtime.js`), narrowed to the one field read here.
 * `storyRenderPhaseChanged` carries the phase name `failIfStoryErrored`'s
 * own poll waits on.
 */

type SerializedChannelError = readonly [{ message?: string }];
type StoryRenderPhaseChanged = readonly [{ newPhase: string; storyId: string }];

declare global {
  interface Window {
    __STORYBOOK_ADDONS_CHANNEL__?: {
      last(eventName: "playFunctionThrewException"): SerializedChannelError | undefined;
      last(eventName: "storyThrewException"): SerializedChannelError | undefined;
      last(eventName: "storyRenderPhaseChanged"): StoryRenderPhaseChanged | undefined;
    };
  }
}

export {};
