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

describe("changing a player's email", () => {
  let h: Harness;
  let player: { id: string; token: string };

  beforeAll(async () => {
    h = await startPocketBase();
    player = await createPlayer(h, "erin");
  }, 90_000);

  afterAll(async () => {
    if (h) await h.stop();
  });

  // 2026-09-04: a non-superuser cannot set their own auth-collection
  // `email` via a plain record update, no matter what's sent — PocketBase
  // rejects it server-side (validation_values_mismatch) regardless of
  // payload shape. This test locks that in so nobody "fixes" /profile
  // back to the broken direct-update approach later.
  it("rejects a plain update() of email, even for a first-time value", async () => {
    const res = await fetch(`${h.baseUrl}/api/collections/players/records/${player.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", Authorization: player.token },
      body: JSON.stringify({ email: "erin@example.com" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { data?: { email?: unknown } };
    expect(body.data?.email).toBeTruthy();
  });

  it("requestEmailChange is a fundamentally different rejection than the plain update — fails only because this test env has no SMTP, not because the request itself is invalid", async () => {
    const res = await fetch(`${h.baseUrl}/api/collections/players/request-email-change`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: player.token },
      body: JSON.stringify({ newEmail: "erin@example.com" }),
    });
    // Real SMTP is configured in production (verified 2026-09-02 with a
    // real delivered send) — this test harness has none, so PocketBase
    // can't actually dispatch the confirmation email and the request
    // fails here specifically at the mail step, not at field validation
    // (unlike the plain-update case above, which is rejected outright
    // regardless of SMTP). That distinction is what this test locks in.
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string; data: unknown };
    expect(body.message).toMatch(/request email change/i);
    expect(body.data).toEqual({});

    // The email must NOT change from this failed attempt.
    const after = (await expectOk(
      await api(h).get(`/api/collections/players/records/${player.id}`),
      "player after request",
    )) as { email: string };
    expect(after.email).toBe("");
  });
});
