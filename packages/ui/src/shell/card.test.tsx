/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { Text } from "react-native";
import { expect, it } from "vitest";
import { GroundPanel } from "./card";

it('scroll="page" (the default) renders a ScrollView whose content carries the clearance and flexGrow', () => {
  render(
    <GroundPanel>
      <Text>hello</Text>
    </GroundPanel>,
  );
  const scroll = screen.getByTestId("ground-panel-scroll");
  expect(scroll).toBeDefined();
  // The content container is the scroll's one child — where the clearance
  // and `flexGrow: 1` live now, not the panel itself.
  const content = scroll.firstElementChild as HTMLElement;
  expect(content).not.toBeNull();
  const style = getComputedStyle(content);
  expect(style.paddingBottom).toBe("22px");
  expect(style.paddingLeft).toBe("22px");
  expect(style.paddingRight).toBe("22px");
  expect(style.flexGrow).toBe("1");
});

it('scroll="own" renders no ScrollView', () => {
  const { container } = render(
    <GroundPanel scroll="own">
      <Text>hello</Text>
    </GroundPanel>,
  );
  expect(screen.queryByTestId("ground-panel-scroll")).toBeNull();
  // The plain `View` this component was before scrolling existed — the
  // clearance lands directly on it, since there is no scroll content to
  // carry it instead.
  const panel = container.firstElementChild as HTMLElement;
  const style = getComputedStyle(panel);
  expect(style.paddingBottom).toBe("22px");
  expect(style.paddingLeft).toBe("22px");
  expect(style.paddingRight).toBe("22px");
});
