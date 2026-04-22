// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ACCENT_COLOR,
  APP_NAME,
  APP_SHORT_NAME,
  PWA_MANIFEST,
  PWA_OPTIONS,
  THEME_COLOR,
} from "./pwa-config.js";

describe("PWA manifest", () => {
  it("declares required Web App Manifest fields", () => {
    expect(PWA_MANIFEST.name).toBe(APP_NAME);
    expect(PWA_MANIFEST.short_name).toBe(APP_SHORT_NAME);
    expect(PWA_MANIFEST.start_url).toBe("/");
    expect(PWA_MANIFEST.display).toBe("standalone");
    expect(PWA_MANIFEST.theme_color).toBe(THEME_COLOR);
    expect(PWA_MANIFEST.background_color).toBeTypeOf("string");
  });

  it("has at least one icon entry per purpose (any + maskable)", () => {
    const icons = PWA_MANIFEST.icons ?? [];
    const purposes = new Set(icons.map((i) => i.purpose));
    expect(purposes.has("any")).toBe(true);
    expect(purposes.has("maskable")).toBe(true);
  });

  it("short_name fits the install banner length budget", () => {
    expect((PWA_MANIFEST.short_name ?? "").length).toBeLessThanOrEqual(12);
  });

  it("defaults to Spanish locale", () => {
    expect(PWA_MANIFEST.lang).toBe("es");
  });

  it("THEME and ACCENT are valid hex colors", () => {
    expect(THEME_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(ACCENT_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

describe("PWA options for vite-plugin-pwa", () => {
  it("uses generated service worker with auto register", () => {
    expect(PWA_OPTIONS.strategies).toBe("generateSW");
    expect(PWA_OPTIONS.registerType).toBe("autoUpdate");
    expect(PWA_OPTIONS.injectRegister).toBe("auto");
  });

  it("never caches /api/ navigations (data must be live)", () => {
    const denylist = PWA_OPTIONS.workbox?.navigateFallbackDenylist ?? [];
    const matchesApi = denylist.some((re) => re.test("/api/players/records"));
    expect(matchesApi).toBe(true);
  });

  it("precaches the static shell assets", () => {
    const globs = PWA_OPTIONS.workbox?.globPatterns ?? [];
    expect(globs.some((g) => g.includes("html"))).toBe(true);
    expect(globs.some((g) => g.includes("js"))).toBe(true);
    expect(globs.some((g) => g.includes("css"))).toBe(true);
  });
});
