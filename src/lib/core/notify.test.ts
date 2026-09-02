import { describe, expect, it } from "vitest";
import { buildDiscordMessage, generateInviteToken } from "./notify.js";

describe("generateInviteToken", () => {
  it("produces a 16-character token from the expected alphabet", () => {
    const token = generateInviteToken();
    expect(token).toHaveLength(16);
    expect(token).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
  });

  it("is deterministic given a fixed rand()", () => {
    const a = generateInviteToken(() => 0);
    const b = generateInviteToken(() => 0);
    expect(a).toBe(b);
    expect(a).toBe("A".repeat(16));
  });

  it("varies with rand()", () => {
    const a = generateInviteToken(() => 0);
    const b = generateInviteToken(() => 0.99);
    expect(a).not.toBe(b);
  });
});

describe("buildDiscordMessage", () => {
  it("names the host, the day/slot, and lists every recipient with their own link", () => {
    const msg = buildDiscordMessage(
      { hostNickname: "ana", weekday: "sat", timeSlot: "afternoon" },
      [
        { nickname: "beto", url: "https://x.test/invite/tok1" },
        { nickname: "carla", url: "https://x.test/invite/tok2" },
      ],
    );
    expect(msg).toContain("ana");
    expect(msg).toContain("sábado");
    expect(msg).toContain("tarde");
    expect(msg).toContain("beto: https://x.test/invite/tok1");
    expect(msg).toContain("carla: https://x.test/invite/tok2");
  });

  it("handles a single recipient", () => {
    const msg = buildDiscordMessage(
      { hostNickname: "ana", weekday: "sun", timeSlot: "night" },
      [{ nickname: "beto", url: "https://x.test/invite/tok1" }],
    );
    expect(msg.split("\n")).toHaveLength(2);
  });
});
