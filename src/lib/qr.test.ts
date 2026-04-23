// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generateQrToken, joinUrl, qrCodeSvg } from "./qr.js";

describe("generateQrToken", () => {
  it("produces a 16-character token", () => {
    expect(generateQrToken()).toHaveLength(16);
  });

  it("only uses unambiguous URL-safe characters (no 0/O/1/I)", () => {
    const t = generateQrToken();
    expect(t).toMatch(/^[A-HJ-NP-Z2-9]+$/);
  });

  it("respects the injected randomness for determinism in tests", () => {
    let i = 0;
    const seq = () => {
      const v = i / 100;
      i = (i + 1) % 100;
      return v;
    };
    const a = generateQrToken(seq);
    i = 0;
    const b = generateQrToken(seq);
    expect(a).toBe(b);
  });
});

describe("joinUrl", () => {
  it("joins an origin and token into the canonical /join/:token URL", () => {
    expect(joinUrl("ABC123", "https://app.tld")).toBe("https://app.tld/join/ABC123");
  });

  it("strips a trailing slash on the origin", () => {
    expect(joinUrl("XYZ", "https://app.tld/")).toBe("https://app.tld/join/XYZ");
  });
});

describe("qrCodeSvg", () => {
  it("returns a self-contained SVG string", async () => {
    const svg = await qrCodeSvg("https://example.test/join/ABCDEFGH");
    expect(svg).toMatch(/<svg[\s\S]*<\/svg>/);
    expect(svg.length).toBeGreaterThan(200);
  });

  it("uses our brand colors (dark on white)", async () => {
    const svg = await qrCodeSvg("hi");
    expect(svg).toContain("#0f172a");
    expect(svg).toContain("#ffffff");
  });
});
