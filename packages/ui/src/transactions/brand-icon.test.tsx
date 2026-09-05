/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandIcon } from "./brand-icon";

describe("BrandIcon", () => {
  it("shows the catalogue's own mark for a recognised brand", () => {
    render(<BrandIcon brandKey="orlen" payee="ORLEN" />);
    expect(screen.getByText("O")).toBeDefined();
  });

  it("shows a different mark for a different recognised brand", () => {
    render(<BrandIcon brandKey="youtube" payee="YouTube" />);
    expect(screen.getByText("YT")).toBeDefined();
  });

  it("falls back to the payee's monogram for an unrecognised key — never blank", () => {
    render(<BrandIcon brandKey={null} payee="Corner Café" />);
    expect(screen.getByText("C")).toBeDefined();
  });

  it("falls back to the payee's monogram when brandKey is absent entirely", () => {
    render(<BrandIcon payee="Corner Café" />);
    expect(screen.getByText("C")).toBeDefined();
  });

  it("falls back even for a key this build's catalogue no longer carries", () => {
    // Invented — never a real merchant not already in the catalogue
    // (CLAUDE.md: placeholders only, round 1's L8).
    render(<BrandIcon brandKey="waltco" payee="Waltco" />);
    expect(screen.getByText("W")).toBeDefined();
  });

  it("the fallback for a blank payee is never blank either", () => {
    render(<BrandIcon brandKey={null} payee="" />);
    expect(screen.getByText("?")).toBeDefined();
  });
});
