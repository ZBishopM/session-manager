import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS_MODEL_DEFAULT,
  buildGeminiRequest,
  buildPrompt,
  extractGeminiText,
  parseAchievements,
  type GameInfo,
} from "./achievement-generator.js";

const catan: GameInfo = {
  name: "Catan",
  description: "Trade, build and settle a new island.",
  categories: ["strategy", "negotiation"],
  minPlayers: 3,
  maxPlayers: 4,
};

describe("buildPrompt", () => {
  it("includes the game name in the user content", () => {
    const { user } = buildPrompt(catan);
    expect(user).toContain("Catan");
  });

  it("includes the player range and categories", () => {
    const { user } = buildPrompt(catan);
    expect(user).toContain("3");
    expect(user).toContain("4");
    expect(user).toContain("strategy");
  });

  it("lists the allowed trigger variables in the system prompt", () => {
    const { system } = buildPrompt(catan);
    expect(system).toContain("wins_on_game");
    expect(system).toContain("losses_on_game");
    expect(system).toContain("current_streak_wins");
    expect(system).toContain("match_duration_minutes");
  });

  it("states the expected JSON output shape in the system prompt", () => {
    const { system } = buildPrompt(catan);
    expect(system).toContain("title");
    expect(system).toContain("description");
    expect(system).toContain("triggerExpr");
    expect(system).toContain("rarity");
    expect(system).toContain("common");
    expect(system).toContain("rare");
    expect(system).toContain("epic");
  });

  it("system prompt is stable between calls (cache-friendly)", () => {
    const a = buildPrompt(catan).system;
    const b = buildPrompt({ ...catan, name: "Other Game" }).system;
    expect(a).toBe(b);
  });
});

describe("buildGeminiRequest", () => {
  it("produces a well-formed Gemini API body by default", () => {
    const body = buildGeminiRequest(buildPrompt(catan));
    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed.systemInstruction).toBeDefined();
    expect(Array.isArray(parsed.contents)).toBe(true);
    expect((parsed.contents as unknown[]).length).toBe(1);
    expect(parsed.generationConfig).toBeDefined();
  });

  it("caps maxOutputTokens to something reasonable", () => {
    const body = buildGeminiRequest(buildPrompt(catan));
    const parsed = JSON.parse(body);
    expect(parsed.generationConfig.maxOutputTokens).toBeGreaterThan(500);
    expect(parsed.generationConfig.maxOutputTokens).toBeLessThanOrEqual(4096);
  });
});

describe("extractGeminiText", () => {
  it("reads the first text content block", () => {
    const res = {
      candidates: [
        {
          content: {
            parts: [{ text: "hello" }]
          }
        }
      ]
    };
    expect(extractGeminiText(res)).toBe("hello");
  });

  it("returns empty string if no text block present", () => {
    expect(extractGeminiText({ candidates: [] })).toBe("");
    expect(extractGeminiText({})).toBe("");
  });

  it("is robust to unexpected shapes", () => {
    expect(extractGeminiText(null)).toBe("");
    expect(extractGeminiText("not an object")).toBe("");
  });
});

describe("parseAchievements", () => {
  const validJson = JSON.stringify([
    {
      title: "First Blood",
      description: "Won your first game. The sheep will speak of this day.",
      triggerExpr: "wins_on_game >= 1",
      rarity: "common",
    },
    {
      title: "Catan Conqueror",
      description: "Five wins. Probably stole the wood.",
      triggerExpr: "wins_on_game >= 5",
      rarity: "rare",
    },
  ]);

  it("parses a valid JSON array", () => {
    const parsed = parseAchievements(validJson);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.title).toBe("First Blood");
  });

  it("extracts JSON wrapped in markdown fences", () => {
    const fenced = "Here you go:\n```json\n" + validJson + "\n```\nHope it helps.";
    expect(parseAchievements(fenced)).toHaveLength(2);
  });

  it("returns an empty array on malformed input", () => {
    expect(parseAchievements("")).toEqual([]);
    expect(parseAchievements("not json")).toEqual([]);
    expect(parseAchievements("{ not: array }")).toEqual([]);
  });

  it("filters entries with invalid trigger expressions", () => {
    const mixed = JSON.stringify([
      {
        title: "Ok",
        description: "valid",
        triggerExpr: "wins_on_game >= 1",
        rarity: "common",
      },
      {
        title: "Broken",
        description: "invalid expr",
        triggerExpr: "process.exit(1)",
        rarity: "common",
      },
    ]);
    const parsed = parseAchievements(mixed);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.title).toBe("Ok");
  });

  it("filters entries with missing or oversized fields", () => {
    const bad = JSON.stringify([
      { description: "no title", triggerExpr: "x >= 1", rarity: "common" },
      { title: "x", description: "y", triggerExpr: "wins_on_game >= 1", rarity: "legendary" },
      {
        title: "x".repeat(300),
        description: "y",
        triggerExpr: "wins_on_game >= 1",
        rarity: "common",
      },
    ]);
    expect(parseAchievements(bad)).toEqual([]);
  });

  it("deduplicates by triggerExpr (keeping first)", () => {
    const dup = JSON.stringify([
      { title: "A", description: "d", triggerExpr: "wins_on_game >= 1", rarity: "common" },
      { title: "B", description: "d", triggerExpr: "wins_on_game >= 1", rarity: "rare" },
    ]);
    const parsed = parseAchievements(dup);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.title).toBe("A");
  });

  it("caps the result to at most 10 achievements to guard against runaway model output", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      title: `Ach ${i}`,
      description: "d",
      triggerExpr: `wins_on_game >= ${i + 1}`,
      rarity: "common",
    }));
    const parsed = parseAchievements(JSON.stringify(many));
    expect(parsed.length).toBeLessThanOrEqual(10);
  });
});
