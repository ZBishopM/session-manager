// @vitest-environment node
import { describe, expect, it, beforeEach } from "vitest";
import { collection, pb, resetPocketBaseClient } from "./pb.js";

describe("pb client wrapper", () => {
  beforeEach(() => {
    resetPocketBaseClient();
  });

  it("returns a PocketBase instance", () => {
    const client = pb("http://example.test");
    expect(client.baseUrl).toBe("http://example.test");
  });

  it("reuses the same instance for the same baseUrl", () => {
    const a = pb("http://example.test");
    const b = pb("http://example.test");
    expect(a).toBe(b);
  });

  it("creates a fresh client when the baseUrl changes", () => {
    const a = pb("http://one.test");
    const b = pb("http://two.test");
    expect(a).not.toBe(b);
  });

  it("collection() returns a RecordService bound to the right name", () => {
    const players = collection("players", pb("http://example.test"));
    expect(players.collectionIdOrName).toBe("players");
  });

  it("typed collection accepts known names only (compile-time)", () => {
    // @ts-expect-error 'unknown_table' is not a CollectionName
    collection("unknown_table");
  });
});
