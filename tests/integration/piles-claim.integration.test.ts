// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, expectOk, startPocketBase, type Harness } from "./harness.js";

interface IdRecord {
  id: string;
  [key: string]: unknown;
}

async function createPlayer(h: Harness, nickname: string): Promise<{ id: string; token: string }> {
  const record = (await expectOk(
    await api(h).post("/api/collections/players/records", {
      username: nickname,
      password: "1234",
      passwordConfirm: "1234",
      nickname,
      xp: 0,
      level: 1,
      re_rolls: 0,
    }),
    `create player ${nickname}`,
  )) as IdRecord;
  const auth = (await expectOk(
    await api(h).post("/api/collections/players/auth-with-password", {
      identity: nickname,
      password: "1234",
    }),
    `login ${nickname}`,
  )) as { token: string };
  return { id: record.id, token: auth.token };
}

async function claimPost(h: Harness, body: unknown): Promise<Response> {
  return fetch(`${h.baseUrl}/api/piles/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// 2026-09-05: production's games catalog was empty, so every claim died on
// `Piles game not configured` and no piles result was ever credited — the
// "Piles" entry was only ever going to exist if someone made it by hand,
// with exactly that name. The endpoint now bootstraps it instead.
describe("POST /api/piles/claim with an empty games catalog", () => {
  let h: Harness;
  let player: { id: string; token: string };

  beforeAll(async () => {
    h = await startPocketBase();
    player = await createPlayer(h, "noel");
  }, 90_000);

  afterAll(async () => {
    if (h) await h.stop();
  });

  it("creates the Piles catalog entry on the first claim and credits the player", async () => {
    const games = (await expectOk(
      await api(h).get("/api/collections/games/records"),
      "games before",
    )) as { totalItems: number };
    expect(games.totalItems).toBe(0);

    const claim = (await expectOk(
      await fetch(`${h.baseUrl}/api/collections/piles_claims/records`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: player.token },
        body: JSON.stringify({ player: player.id, code: "BOOT12" }),
      }),
      "create claim",
    )) as IdRecord;
    expect(claim.code).toBe("BOOT12");

    const res = await claimPost(h, { code: "BOOT12", placement: 1, points: 10 });
    expect(res.status).toBe(200);

    const after = (await expectOk(
      await api(h).get("/api/collections/games/records"),
      "games after",
    )) as { totalItems: number; items: Array<{ name: string; created_by: string }> };
    expect(after.totalItems).toBe(1);
    const game = after.items[0];
    expect(game?.name).toBe("Piles");
    // Debe pertenecer al jugador: update/delete exigen created_by = auth.id.
    expect(game?.created_by).toBe(player.id);

    // Y el resultado llega de verdad al perfil.
    const mp = (await expectOk(
      await api(h).get(`/api/collections/match_players/records?filter=player="${player.id}"`),
      "match_players",
    )) as { totalItems: number; items: Array<{ won: boolean }> };
    expect(mp.totalItems).toBe(1);
    expect(mp.items[0]?.won).toBe(true);
  });

  it("reuses the same catalog entry on later claims instead of duplicating it", async () => {
    const res = await claimPost(h, { code: "BOOT12", placement: 3, points: 5 });
    expect(res.status).toBe(200);
    const games = (await expectOk(
      await api(h).get("/api/collections/games/records"),
      "games after second claim",
    )) as { totalItems: number };
    expect(games.totalItems).toBe(1);
  });
});

describe("POST /api/piles/claim", () => {
  let h: Harness;
  let player: { id: string; token: string };

  beforeAll(async () => {
    h = await startPocketBase();
    player = await createPlayer(h, "dana");
    await expectOk(
      await api(h).post("/api/collections/games/records", {
        name: "Piles",
        min_players: 2,
        max_players: 6,
        created_by: player.id,
      }),
      "create Piles game",
    );
  }, 90_000);

  afterAll(async () => {
    if (h) await h.stop();
  });

  async function generateCode(): Promise<string> {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const claim = (await expectOk(
      await fetch(`${h.baseUrl}/api/collections/piles_claims/records`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: player.token },
        body: JSON.stringify({ player: player.id, code }),
      }),
      "create claim code",
    )) as IdRecord;
    return claim.code as string;
  }

  it("credits the player and marks the code's last-used timestamp on a valid claim", async () => {
    const code = await generateCode();
    const before = (await expectOk(
      await api(h).get(`/api/collections/players/records/${player.id}`),
      "player before",
    )) as { xp: number };

    const res = await claimPost(h, { code, placement: 1, points: 100 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    const after = (await expectOk(
      await api(h).get(`/api/collections/players/records/${player.id}`),
      "player after",
    )) as { xp: number };
    // participate_match(10) + win_match(15) = 25, since placement 1 -> won.
    expect(after.xp).toBe(before.xp + 25);

    const claims = (await expectOk(
      await api(h).get(
        `/api/collections/piles_claims/records?filter=${encodeURIComponent(`code = "${code}"`)}`,
      ),
      "list claim",
    )) as { items: Array<{ consumed_at: string }> };
    expect(claims.items[0]?.consumed_at).toBeTruthy();
  });

  it("a standing code can be claimed again for a second match, not single-use", async () => {
    const code = await generateCode();
    const before = (await expectOk(
      await api(h).get(`/api/collections/players/records/${player.id}`),
      "player before",
    )) as { xp: number };

    const first = await claimPost(h, { code, placement: 1, points: 100 });
    expect(first.status).toBe(200);
    const second = await claimPost(h, { code, placement: 2, points: 50 });
    expect(second.status).toBe(200);

    const after = (await expectOk(
      await api(h).get(`/api/collections/players/records/${player.id}`),
      "player after two claims",
    )) as { xp: number };
    // match 1 (won, placement 1): participate(10) + win(15) = 25.
    // match 2 (lost, placement 2): participate(10) = 10.
    expect(after.xp).toBe(before.xp + 35);
  });

  it("rejects an unknown code", async () => {
    const res = await claimPost(h, { code: "NOPE12", placement: 1, points: 0 });
    expect(res.status).toBe(404);
  });

  // 2026-09-05: reported as "no se pudo vincular: unknown code" at game-over.
  // Codes are generated uppercase and piles-game's input only *looks*
  // uppercase (CSS text-transform doesn't change the value), so a
  // hand-typed code was sent lowercase and missed a case-sensitive filter.
  it("accepts a code typed in lowercase", async () => {
    const code = await generateCode();
    const res = await claimPost(h, { code: code.toLowerCase(), placement: 1, points: 0 });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });

  it("accepts a code with stray whitespace around it", async () => {
    const code = await generateCode();
    const res = await claimPost(h, { code: `  ${code}  `, placement: 2, points: 0 });
    expect(res.status).toBe(200);
  });

  // This endpoint is public and unauthenticated, so the code must never be
  // interpolated into the filter expression raw.
  it("does not let a crafted code break out of the lookup filter", async () => {
    await generateCode();
    for (const attack of ['" || code != "', 'X" || "1"="1', '" || id != "']) {
      const res = await claimPost(h, { code: attack, placement: 1, points: 0 });
      expect(res.status).toBe(404);
    }
  });
});
