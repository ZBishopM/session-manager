// @vitest-environment node
import PocketBase from "pocketbase";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  currentUser,
  isAuthenticated,
  login,
  logout,
  signup,
} from "../../src/lib/auth.js";
import { startPocketBase, type Harness } from "./harness.js";

describe("auth helpers against a real PocketBase", () => {
  let h: Harness;
  let client: PocketBase;

  beforeAll(async () => {
    h = await startPocketBase();
    client = new PocketBase(h.baseUrl);
  }, 60_000);

  afterAll(async () => {
    if (h) await h.stop();
  });

  it("signup creates a player and logs them in", async () => {
    const { user, token } = await signup("alice", "1234", client);
    expect(user.nickname).toBe("alice");
    expect(user.id).toMatch(/^[a-z0-9]{15}$/);
    expect(token).toBeTypeOf("string");
    expect(token.length).toBeGreaterThan(20);
    expect(isAuthenticated(client)).toBe(true);
    expect(currentUser(client)?.id).toBe(user.id);
  });

  it("login accepts the same nickname + passcode after logout", async () => {
    logout(client);
    expect(isAuthenticated(client)).toBe(false);
    expect(currentUser(client)).toBeNull();

    const { user } = await login("alice", "1234", client);
    expect(user.nickname).toBe("alice");
    expect(isAuthenticated(client)).toBe(true);
  });

  it("login rejects wrong passcode without leaking auth state", async () => {
    logout(client);
    await expect(login("alice", "9999", client)).rejects.toBeDefined();
    expect(isAuthenticated(client)).toBe(false);
  });

  it("signup rejects a duplicate nickname (unique constraint)", async () => {
    await expect(signup("alice", "1234", client)).rejects.toBeDefined();
  });

  it("signup rejects a too-short passcode (PB minPasswordLength=4)", async () => {
    await expect(signup("zoe", "12", client)).rejects.toBeDefined();
  });
});
