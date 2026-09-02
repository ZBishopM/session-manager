import { describe, expect, it } from "vitest";
import { buildDiscordMessage, buildInviteEmail, generateInviteToken } from "./notify.js";

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
  it("names the host, the day/hour range, and lists every recipient with their own link", () => {
    const msg = buildDiscordMessage(
      { hostNickname: "ana", weekday: "sat", startHour: 14, endHour: 18 },
      [
        { nickname: "beto", url: "https://x.test/invite/tok1" },
        { nickname: "carla", url: "https://x.test/invite/tok2" },
      ],
    );
    expect(msg).toContain("ana");
    expect(msg).toContain("sábado");
    expect(msg).toContain("14:00–18:00");
    expect(msg).toContain("beto: https://x.test/invite/tok1");
    expect(msg).toContain("carla: https://x.test/invite/tok2");
  });

  it("handles a single recipient", () => {
    const msg = buildDiscordMessage(
      { hostNickname: "ana", weekday: "sun", startHour: 21, endHour: 24 },
      [{ nickname: "beto", url: "https://x.test/invite/tok1" }],
    );
    expect(msg.split("\n")).toHaveLength(2);
  });
});

describe("buildInviteEmail", () => {
  it("names the host and day/hour range in the subject, and includes the recipient's own link", () => {
    const email = buildInviteEmail(
      { hostNickname: "ana", weekday: "sat", startHour: 14, endHour: 18 },
      { nickname: "beto", url: "https://x.test/invite/tok1" },
    );
    expect(email.subject).toContain("ana");
    expect(email.subject).toContain("sábado");
    expect(email.html).toContain("14:00–18:00");
    expect(email.html).toContain("beto");
    expect(email.html).toContain("https://x.test/invite/tok1");
  });
});
