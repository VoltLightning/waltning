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
    // (CLAUDE.md: placeholders only).
    render(<BrandIcon brandKey="waltco" payee="Waltco" />);
    expect(screen.getByText("W")).toBeDefined();
  });

  it("the fallback for a blank payee is never blank either", () => {
    render(<BrandIcon brandKey={null} payee="" />);
    expect(screen.getByText("?")).toBeDefined();
  });

  /**
   * The badge is decorative: the row around it already announces the payee.
   * Only the web attribute is assertable here — `accessibilityElementsHidden`
   * (iOS) and `importantForAccessibility` (Android) are native props
   * react-native-web does not render into the DOM — so this pins the one of
   * the three a test can see, and `brand-icon.tsx` names why the other two
   * are there.
   */
  it("is hidden from the accessibility tree — aria-hidden on the web target", () => {
    const { container } = render(<BrandIcon brandKey="orlen" payee="ORLEN" />);
    const badge = container.querySelector("[aria-hidden]");
    expect(badge, "the recognised badge carries aria-hidden").not.toBeNull();
    expect(badge?.textContent).toBe("O");
  });

  it("the monogram fallback is hidden the same way — the payee text says who it is", () => {
    const { container } = render(<BrandIcon brandKey={null} payee="Corner Café" />);
    const badge = container.querySelector("[aria-hidden]");
    expect(badge, "the fallback badge carries aria-hidden too").not.toBeNull();
    expect(badge?.textContent).toBe("C");
  });
});
