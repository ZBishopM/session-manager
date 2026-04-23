import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import { RANDOM_VOTE } from "$core/voting.js";
import type { GamesRecord } from "$core/records.js";
import VoteSheet from "./VoteSheet.svelte";

function game(
  base: { id: string; name: string },
  over: Partial<GamesRecord> = {},
): GamesRecord {
  return {
    created: "",
    updated: "",
    collectionId: "pbc_games000000",
    collectionName: "games",
    min_players: 2,
    max_players: 4,
    created_by: "p1",
    ...base,
    ...over,
  };
}

const catan = game({ id: "g1", name: "Catan" }, { min_players: 3, max_players: 4 });
const dixit = game({ id: "g2", name: "Dixit" }, { min_players: 3, max_players: 6 });

describe("<VoteSheet />", () => {
  it("renders a card per game plus the random option", () => {
    render(VoteSheet, { props: { games: [catan, dixit] } });
    expect(screen.getByTestId("vote-g1")).toHaveTextContent("Catan");
    expect(screen.getByTestId("vote-g2")).toHaveTextContent("Dixit");
    expect(screen.getByTestId("vote-random")).toHaveTextContent(/aleatorio/i);
  });

  it("renders an empty state when no games are eligible — random remains", () => {
    render(VoteSheet, { props: { games: [] } });
    expect(screen.getByTestId("empty")).toBeInTheDocument();
    expect(screen.getByTestId("vote-random")).toBeInTheDocument();
  });

  it("emits a `vote` event with the selected gameId", async () => {
    const { component } = render(VoteSheet, { props: { games: [catan, dixit] } });
    const onVote = vi.fn();
    component.$on("vote", (e: CustomEvent) => onVote(e.detail));
    await fireEvent.click(screen.getByTestId("vote-g2"));
    expect(onVote).toHaveBeenCalledWith({ gameId: "g2" });
  });

  it("emits the RANDOM_VOTE marker when random is picked", async () => {
    const { component } = render(VoteSheet, { props: { games: [catan] } });
    const onVote = vi.fn();
    component.$on("vote", (e: CustomEvent) => onVote(e.detail));
    await fireEvent.click(screen.getByTestId("vote-random"));
    expect(onVote).toHaveBeenCalledWith({ gameId: RANDOM_VOTE });
  });

  it("does not re-emit when the same option is tapped again", async () => {
    const { component } = render(VoteSheet, {
      props: { games: [catan], currentVote: "g1" },
    });
    const onVote = vi.fn();
    component.$on("vote", (e: CustomEvent) => onVote(e.detail));
    await fireEvent.click(screen.getByTestId("vote-g1"));
    expect(onVote).not.toHaveBeenCalled();
  });

  it("reflects currentVote via aria-checked", () => {
    render(VoteSheet, { props: { games: [catan, dixit], currentVote: "g2" } });
    expect(screen.getByTestId("vote-g1")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("vote-g2")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("vote-random")).toHaveAttribute("aria-checked", "false");
  });

  it("highlights random when currentVote is RANDOM_VOTE", () => {
    render(VoteSheet, { props: { games: [catan], currentVote: RANDOM_VOTE } });
    expect(screen.getByTestId("vote-random")).toHaveAttribute("aria-checked", "true");
  });

  it("ignores taps when disabled", async () => {
    const { component } = render(VoteSheet, {
      props: { games: [catan], disabled: true },
    });
    const onVote = vi.fn();
    component.$on("vote", (e: CustomEvent) => onVote(e.detail));
    await fireEvent.click(screen.getByTestId("vote-g1"));
    await fireEvent.click(screen.getByTestId("vote-random"));
    expect(onVote).not.toHaveBeenCalled();
  });

  it("shows the player range on each game card", () => {
    render(VoteSheet, { props: { games: [catan] } });
    expect(screen.getByTestId("vote-g1")).toHaveTextContent("3–4 jugadores");
  });
});
