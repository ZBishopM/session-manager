import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import { xpForLevel } from "$core/xp.js";
import XpBar from "./XpBar.svelte";

describe("<XpBar />", () => {
  it("renders level 1 at 0 xp", () => {
    render(XpBar, { props: { xp: 0 } });
    expect(screen.getByTestId("level")).toHaveTextContent("Nv 1");
  });

  it("renders level 2 at exactly 100 xp with 0 progress into the level", () => {
    render(XpBar, { props: { xp: xpForLevel(2) } });
    expect(screen.getByTestId("level")).toHaveTextContent("Nv 2");
    expect(screen.getByTestId("counter")).toHaveTextContent(/0 \/ \d+ XP/);
  });

  it("shows an accessible progressbar with the right values", () => {
    const xp = xpForLevel(3) + 50;
    render(XpBar, { props: { xp } });
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "50");
    expect(bar).toHaveAttribute(
      "aria-valuemax",
      String(xpForLevel(4) - xpForLevel(3)),
    );
  });

  it("fill width is between 0 and 100 percent", () => {
    render(XpBar, { props: { xp: 150 } });
    const fill = screen.getByTestId("xp-fill") as HTMLElement;
    const width = parseFloat(fill.style.width);
    expect(width).toBeGreaterThanOrEqual(0);
    expect(width).toBeLessThanOrEqual(100);
  });

  it("updates when xp prop changes", async () => {
    const { rerender } = render(XpBar, { props: { xp: 0 } });
    expect(screen.getByTestId("level")).toHaveTextContent("Nv 1");
    await rerender({ xp: xpForLevel(5) });
    expect(screen.getByTestId("level")).toHaveTextContent("Nv 5");
  });
});
