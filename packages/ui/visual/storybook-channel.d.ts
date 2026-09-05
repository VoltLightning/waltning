/**
 * The preview's own event channel, as the page sees it — Storybook's own
 * `Channel`, installed as a page global once the preview bundle boots
 * (`storybook/dist/preview/runtime.js`'s `channel-slot`). Declared rather
 * than imported for the same reason `axe.d.ts` is: this is a runtime global
 * a browser bundle creates, not a module this spec can import from. Narrow
 * to the one method the spec calls — `.last(eventName)`, the channel's own
 * record of an event's most recent args, which needs no listener installed
 * before the event fires to still answer correctly after it has.
 */

declare global {
  interface Window {
    __STORYBOOK_ADDONS_CHANNEL__?: {
      last: (eventName: string) => readonly unknown[] | undefined;
    };
  }
}

export {};
