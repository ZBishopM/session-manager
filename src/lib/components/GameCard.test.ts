import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import type { GamesRecord } from "$core/records.js";
import GameCard from "./GameCard.svelte";

function game(over: Partial<GamesRecord> = {}): GamesRecord {
  return {
    id: "g1",
    name: "Catan",
    created: "",
    updated: "",
    collectionId: "pbc_games000000",
    collectionName: "games",
    min_players: 3,
    max_players: 4,
    created_by: "p1",
    ...over,
  };
}

describe("<GameCard />", () => {
  it("shows name and player range", () => {
    render(GameCard, { props: { game: game() } });
    const card = screen.getByTestId("game-card-g1");
    expect(card).toHaveTextContent("Catan");
    expect(card).toHaveTextContent("3–4");
  });

  it("renders description when present, omits it when empty", () => {
    const { unmount } = render(GameCard, {
      props: { game: game({ description: "Trade and build." }) },
    });
    expect(screen.getByText(/trade and build/i)).toBeInTheDocument();
    unmount();
    render(GameCard, { props: { game: game({ description: "" }) } });
    expect(screen.queryByText(/trade and build/i)).not.toBeInTheDocument();
  });

  it("renders category chips", () => {
    render(GameCard, {
      props: { game: game(), categoryNames: ["estrategia", "negociación"] },
    });
    expect(screen.getByText("estrategia")).toBeInTheDocument();
    expect(screen.getByText("negociación")).toBeInTheDocument();
  });
});
