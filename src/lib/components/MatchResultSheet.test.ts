import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import MatchResultSheet from "./MatchResultSheet.svelte";

const players = [
  { id: "p1", nickname: "Alice" },
  { id: "p2", nickname: "Bob" },
  { id: "p3", nickname: "Cleo" },
];

describe("<MatchResultSheet />", () => {
  it("lists every player with a 'lost' default state", () => {
    render(MatchResultSheet, { props: { players } });
    for (const p of players) {
      expect(screen.getByTestId(`winner-${p.id}`)).toHaveTextContent(p.nickname);
      expect(screen.getByTestId(`winner-status-${p.id}`)).toHaveTextContent(/perdió/i);
    }
  });

  it("tapping a player toggles their winner state", async () => {
    render(MatchResultSheet, { props: { players } });
    await fireEvent.click(screen.getByTestId("winner-p1"));
    expect(screen.getByTestId("winner-status-p1")).toHaveTextContent(/ganó/);
    await fireEvent.click(screen.getByTestId("winner-p1"));
    expect(screen.getByTestId("winner-status-p1")).toHaveTextContent(/perdió/);
  });

  it("supports multiple winners (team games)", async () => {
    render(MatchResultSheet, { props: { players } });
    await fireEvent.click(screen.getByTestId("winner-p1"));
    await fireEvent.click(screen.getByTestId("winner-p2"));
    expect(screen.getByTestId("winner-status-p1")).toHaveTextContent(/ganó/);
    expect(screen.getByTestId("winner-status-p2")).toHaveTextContent(/ganó/);
    expect(screen.getByTestId("winner-status-p3")).toHaveTextContent(/perdió/);
  });

  it("aria-checked reflects the selection state", async () => {
    render(MatchResultSheet, { props: { players } });
    const btn = screen.getByTestId("winner-p2");
    expect(btn).toHaveAttribute("aria-checked", "false");
    await fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-checked", "true");
  });

  it("displays duration as mm:ss alongside the seconds input", async () => {
    render(MatchResultSheet, { props: { players, initialDurationSeconds: 125 } });
    expect(screen.getByTestId("duration-display")).toHaveTextContent("02:05");
  });

  it("editing the duration input updates the mm:ss display", async () => {
    render(MatchResultSheet, { props: { players } });
    const input = screen.getByTestId("duration-input") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "3661" } });
    expect(screen.getByTestId("duration-display")).toHaveTextContent("61:01");
  });

  it("confirm button is disabled until at least one winner is marked", async () => {
    render(MatchResultSheet, { props: { players } });
    const confirm = screen.getByTestId("confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await fireEvent.click(screen.getByTestId("winner-p1"));
    expect(confirm.disabled).toBe(false);
  });

  it("emits a `confirm` event with winnerIds and floored seconds", async () => {
    const { component } = render(MatchResultSheet, {
      props: { players, initialDurationSeconds: 90 },
    });
    const onConfirm = vi.fn();
    component.$on("confirm", (e: CustomEvent) => onConfirm(e.detail));
    await fireEvent.click(screen.getByTestId("winner-p1"));
    await fireEvent.click(screen.getByTestId("winner-p3"));
    await fireEvent.click(screen.getByTestId("confirm"));
    expect(onConfirm).toHaveBeenCalledWith({
      winnerIds: ["p1", "p3"],
      durationSeconds: 90,
    });
  });

  it("typing placement 1 counts as a winner without tapping the toggle", async () => {
    render(MatchResultSheet, { props: { players } });
    const confirm = screen.getByTestId("confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await fireEvent.input(screen.getByTestId("placement-p1"), { target: { value: "1" } });
    expect(confirm.disabled).toBe(false);
  });

  it("emits placements only for players with a value entered, and derives winnerIds from placement 1", async () => {
    const { component } = render(MatchResultSheet, { props: { players, initialDurationSeconds: 90 } });
    const onConfirm = vi.fn();
    component.$on("confirm", (e: CustomEvent) => onConfirm(e.detail));
    await fireEvent.input(screen.getByTestId("placement-p1"), { target: { value: "1" } });
    await fireEvent.input(screen.getByTestId("placement-p2"), { target: { value: "2" } });
    await fireEvent.click(screen.getByTestId("confirm"));
    expect(onConfirm).toHaveBeenCalledWith({
      winnerIds: ["p1"],
      durationSeconds: 90,
      placements: { p1: 1, p2: 2 },
    });
  });

  it("omits placements entirely from the emitted event when no placement was entered", async () => {
    const { component } = render(MatchResultSheet, { props: { players, initialDurationSeconds: 90 } });
    const onConfirm = vi.fn();
    component.$on("confirm", (e: CustomEvent) => onConfirm(e.detail));
    await fireEvent.click(screen.getByTestId("winner-p1"));
    await fireEvent.click(screen.getByTestId("confirm"));
    expect(onConfirm).toHaveBeenCalledWith({ winnerIds: ["p1"], durationSeconds: 90 });
  });

  it("ignores taps and confirm when disabled", async () => {
    const { component } = render(MatchResultSheet, {
      props: { players, disabled: true },
    });
    const onConfirm = vi.fn();
    component.$on("confirm", (e: CustomEvent) => onConfirm(e.detail));
    await fireEvent.click(screen.getByTestId("winner-p1"));
    await fireEvent.click(screen.getByTestId("confirm"));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByTestId("winner-status-p1")).toHaveTextContent(/perdió/);
  });
});
