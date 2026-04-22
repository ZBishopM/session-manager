import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import PatternPad from "./PatternPad.svelte";

function tap(index: number) {
  return fireEvent.click(screen.getByTestId(`dot-${index}`));
}

describe("<PatternPad />", () => {
  it("starts empty: no order labels, counter at 0/9", () => {
    render(PatternPad);
    expect(screen.queryByTestId("order-0")).not.toBeInTheDocument();
    expect(screen.getByTestId("counter")).toHaveTextContent("0 / 9");
  });

  it("tapping a dot adds it to the sequence with its order number", async () => {
    render(PatternPad);
    await tap(4);
    await tap(0);
    expect(screen.getByTestId("order-4")).toHaveTextContent("1");
    expect(screen.getByTestId("order-0")).toHaveTextContent("2");
    expect(screen.getByTestId("counter")).toHaveTextContent("2 / 9");
  });

  it("ignores re-taps on a point already in the sequence", async () => {
    render(PatternPad);
    await tap(0);
    await tap(0);
    await tap(0);
    expect(screen.getByTestId("counter")).toHaveTextContent("1 / 9");
  });

  it("submit is disabled until min points are tapped", async () => {
    render(PatternPad);
    const submit = screen.getByTestId("submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await tap(0);
    await tap(1);
    await tap(2);
    expect(submit.disabled).toBe(true);
    await tap(3);
    expect(submit.disabled).toBe(false);
  });

  it("clear button is disabled when no points are tapped", async () => {
    render(PatternPad);
    const clear = screen.getByTestId("clear") as HTMLButtonElement;
    expect(clear.disabled).toBe(true);
    await tap(0);
    expect(clear.disabled).toBe(false);
    await fireEvent.click(clear);
    expect(clear.disabled).toBe(true);
    expect(screen.getByTestId("counter")).toHaveTextContent("0 / 9");
  });

  it("emits a `change` event on every tap with the current sequence", async () => {
    const { component } = render(PatternPad);
    const changes: number[][] = [];
    component.$on("change", (e: CustomEvent<{ points: number[] }>) => {
      changes.push([...e.detail.points]);
    });
    await tap(2);
    await tap(5);
    expect(changes).toEqual([[2], [2, 5]]);
  });

  it("emits a `submit` event with the canonical string", async () => {
    const { component } = render(PatternPad);
    const onSubmit = vi.fn();
    component.$on("submit", (e: CustomEvent) => onSubmit(e.detail));
    await tap(0);
    await tap(1);
    await tap(2);
    await tap(5);
    await fireEvent.click(screen.getByTestId("submit"));
    expect(onSubmit).toHaveBeenCalledWith({
      points: [0, 1, 2, 5],
      canonical: "0125",
    });
  });

  it("respects a custom maxPoints limit", async () => {
    render(PatternPad, { props: { maxPoints: 5 } });
    for (let i = 0; i < 9; i++) await tap(i);
    expect(screen.getByTestId("counter")).toHaveTextContent("5 / 5");
  });

  it("does not respond to taps when disabled", async () => {
    render(PatternPad, { props: { disabled: true } });
    await tap(0);
    await tap(1);
    expect(screen.getByTestId("counter")).toHaveTextContent("0 / 9");
    expect(
      (screen.getByTestId("submit") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("dot button advertises its selection state via aria-pressed", async () => {
    render(PatternPad);
    const dot = screen.getByTestId("dot-3");
    expect(dot).toHaveAttribute("aria-pressed", "false");
    await fireEvent.click(dot);
    expect(dot).toHaveAttribute("aria-pressed", "true");
  });
});
