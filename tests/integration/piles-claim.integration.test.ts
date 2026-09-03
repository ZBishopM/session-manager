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

  it("credits the player and marks the code consumed on a valid claim", async () => {
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

  it("rejects an already-consumed code", async () => {
    const code = await generateCode();
    await claimPost(h, { code, placement: 1, points: 100 });
    const second = await claimPost(h, { code, placement: 1, points: 100 });
    expect(second.status).toBe(409);
  });

  it("rejects an unknown code", async () => {
    const res = await claimPost(h, { code: "NOPE12", placement: 1, points: 0 });
    expect(res.status).toBe(404);
  });
});
