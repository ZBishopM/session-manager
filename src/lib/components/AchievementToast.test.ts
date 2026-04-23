import { fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";
import AchievementToast from "./AchievementToast.svelte";
import type { ToastAchievement } from "./AchievementToast.types.js";

const baseAchievement: ToastAchievement = {
  id: "ach-1",
  title: "First Stone",
  description: "Your first Mancala win — the pebbles bow before you.",
  rarity: "common",
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("<AchievementToast />", () => {

  it("renders title and description", () => {
    render(AchievementToast, { props: { achievement: baseAchievement, soundEnabled: false } });
    expect(screen.getByTestId("title")).toHaveTextContent("First Stone");
    expect(screen.getByTestId("description")).toHaveTextContent(/pebbles bow/);
  });

  it("rarity label varies with the rarity prop", () => {
    const { unmount } = render(AchievementToast, {
      props: {
        achievement: { ...baseAchievement, rarity: "epic" },
        soundEnabled: false,
      },
    });
    expect(screen.getByTestId("rarity")).toHaveTextContent(/épico/i);
    unmount();
    render(AchievementToast, {
      props: {
        achievement: { ...baseAchievement, rarity: "rare" },
        soundEnabled: false,
      },
    });
    expect(screen.getByTestId("rarity")).toHaveTextContent(/raro/i);
  });

  it("shows player nickname when provided", () => {
    render(AchievementToast, {
      props: {
        achievement: baseAchievement,
        playerNickname: "Alice",
        soundEnabled: false,
      },
    });
    expect(screen.getByTestId("player")).toHaveTextContent("Alice");
  });

  it("hides player area when nickname is not provided", () => {
    render(AchievementToast, { props: { achievement: baseAchievement, soundEnabled: false } });
    expect(screen.queryByTestId("player")).not.toBeInTheDocument();
  });

  it("emits a `dismiss` event when the close button is tapped", async () => {
    const { component } = render(AchievementToast, {
      props: { achievement: baseAchievement, soundEnabled: false, autoDismissMs: 0 },
    });
    const onDismiss = vi.fn();
    component.$on("dismiss", (e: CustomEvent) => onDismiss(e.detail));
    await fireEvent.click(screen.getByTestId("dismiss"));
    expect(onDismiss).toHaveBeenCalledWith({ id: "ach-1" });
  });

  it("auto-dismisses after autoDismissMs", async () => {
    let dismissed = 0;
    const { component } = render(AchievementToast, {
      props: { achievement: baseAchievement, soundEnabled: false, autoDismissMs: 80 },
    });
    component.$on("dismiss", () => {
      dismissed += 1;
    });
    // Svelte 4's onMount runs in a microtask after render — flush it before
    // we start waiting for the setTimeout it registers.
    await tick();
    await wait(30);
    expect(dismissed).toBe(0);
    await wait(120);
    expect(dismissed).toBe(1);
  });

  it("does not auto-dismiss when autoDismissMs is 0", async () => {
    let dismissed = 0;
    const { component } = render(AchievementToast, {
      props: { achievement: baseAchievement, soundEnabled: false, autoDismissMs: 0 },
    });
    component.$on("dismiss", () => {
      dismissed += 1;
    });
    await wait(150);
    expect(dismissed).toBe(0);
  });

  it("ARIA live region announces the toast", () => {
    render(AchievementToast, { props: { achievement: baseAchievement, soundEnabled: false } });
    const toast = screen.getByTestId("toast");
    expect(toast).toHaveAttribute("role", "status");
    expect(toast).toHaveAttribute("aria-live", "polite");
  });

  it("sound playback no-ops cleanly when AudioContext is unavailable", () => {
    // jsdom doesn't ship AudioContext; the component must not throw.
    expect(() =>
      render(AchievementToast, {
        props: { achievement: baseAchievement, soundEnabled: true },
      }),
    ).not.toThrow();
  });
});
