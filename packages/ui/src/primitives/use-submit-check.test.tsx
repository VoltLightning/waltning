/** @vitest-environment jsdom */

/**
 * `useSubmitCheck` — a refused submit shows every error, raises the alert in
 * the window the fields are drawn in, and scrolls to the first broken one.
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { describe, expect, it, vi } from "vitest";
import { space } from "../tokens.ts";
import { FieldAnchor } from "./field-anchor";
import { FieldRevealProvider } from "./field-reveal";
import { FormAlertHost } from "./form-alert-host";
import { useSubmitCheck } from "./use-submit-check.ts";

function nothing(): void {}

const ALERT = "The form isn't complete — check the highlighted fields.";

function Form({ onSave }: { onSave: () => void }) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const check = useSubmitCheck({
    name: name === "" && "Name required",
    city: city === "" && "City required",
  });
  const handleSave = useCallback(() => check.submit(onSave), [check, onSave]);
  return (
    <View>
      <FieldAnchor check={check} field="name">
        <TextInput accessibilityLabel="Name" value={name} onChangeText={setName} />
        {check.errorFor("name") ? <Text>{check.errorFor("name")}</Text> : null}
      </FieldAnchor>
      <FieldAnchor check={check} field="city">
        <TextInput accessibilityLabel="City" value={city} onChangeText={setCity} />
        {check.errorFor("city") ? <Text>{check.errorFor("city")}</Text> : null}
      </FieldAnchor>
      <Pressable accessibilityRole="button" onPress={handleSave}>
        <Text>Save</Text>
      </Pressable>
    </View>
  );
}

/** A scroller that records where it was asked to go, measured the way a device would. */
function Scroller({ onScroll, children }: { onScroll: (y: number) => void; children: ReactNode }) {
  const scroller = useRef({ scrollTo: ({ y }: { y: number }) => onScroll(y) });
  const mark = useRef<View>(null);
  return (
    <FieldRevealProvider scroller={scroller} contentTop={mark}>
      <View ref={mark} />
      {children}
    </FieldRevealProvider>
  );
}

describe("a submit on a form that is not ready", () => {
  it("says nothing until Save is pressed", () => {
    render(
      <FormAlertHost>
        <Form onSave={vi.fn()} />
      </FormAlertHost>,
    );
    expect(screen.queryByText("Name required")).toBeNull();
    expect(screen.queryByText(ALERT)).toBeNull();
  });

  it("shows every error, raises the alert, and saves nothing", () => {
    const onSave = vi.fn();
    render(
      <FormAlertHost>
        <Form onSave={onSave} />
      </FormAlertHost>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Name required")).toBeDefined();
    expect(screen.getByText("City required")).toBeDefined();
    expect(screen.getByText(ALERT)).toBeDefined();
  });

  it("clears each error as its field is fixed, and saves once none is left", () => {
    const onSave = vi.fn();
    render(
      <FormAlertHost>
        <Form onSave={onSave} />
      </FormAlertHost>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bank A" } });
    expect(screen.queryByText("Name required")).toBeNull();
    expect(screen.getByText("City required")).toBeDefined();

    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Town B" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("scrolls to the first broken field in drawn order, not the last", async () => {
    const onScroll = vi.fn();
    render(
      <FormAlertHost>
        <Scroller onScroll={onScroll}>
          <Form onSave={vi.fn()} />
        </Scroller>
      </FormAlertHost>,
    );
    // Name is fixed; City is the only one left, and the one scrolled to.
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bank A" } });
    const city = screen.getByLabelText("City").parentElement as HTMLElement;
    const measured = vi
      .spyOn(city, "getBoundingClientRect")
      .mockReturnValue({ top: 640, left: 0, width: 300, height: 48 } as DOMRect);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // Its top, less the room left for its label; the content's own top is 0.
    await waitFor(() => expect(onScroll).toHaveBeenCalledWith(640 - space.x3));
    expect(onScroll).toHaveBeenCalledTimes(1);
    measured.mockRestore();
  });

  /**
   * A form that renders its own sheet calls the hook outside the sheet's
   * host; the alert must still land in the sheet, where the fields are.
   */
  it("raises the alert in the host the fields are drawn in", () => {
    function Outer() {
      const check = useSubmitCheck({ name: "Name required" });
      const handleSave = useCallback(() => check.submit(nothing), [check]);
      return (
        <View testID="window">
          <FormAlertHost>
            <View testID="sheet">
              <FieldAnchor check={check} field="name">
                <Text>Name</Text>
              </FieldAnchor>
              <Pressable accessibilityRole="button" onPress={handleSave}>
                <Text>Save</Text>
              </Pressable>
            </View>
          </FormAlertHost>
        </View>
      );
    }
    render(
      <FormAlertHost>
        <Outer />
      </FormAlertHost>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // One alert, and it is the inner host's.
    expect(screen.getAllByText(ALERT)).toHaveLength(1);
    expect(within(screen.getByTestId("window")).getByText(ALERT)).toBeDefined();
  });
});
