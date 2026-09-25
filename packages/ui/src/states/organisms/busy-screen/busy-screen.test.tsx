/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { BusyScreen } from "./busy-screen";

it("covers the app with what is running and how far it has got", () => {
  render(<BusyScreen visible title="Loading demo data" detail="Writing history… 60 of 540" />);

  expect(screen.getByText("Loading demo data")).toBeDefined();
  expect(screen.getByText("Writing history… 60 of 540")).toBeDefined();
});

/** Nothing running is nothing drawn — not an empty sheet left over the app. */
it("draws nothing when nothing is running", () => {
  render(<BusyScreen visible={false} title="Loading demo data" />);

  expect(screen.queryByText("Loading demo data")).toBeNull();
});
