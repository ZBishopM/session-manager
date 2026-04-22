/**
 * PWA configuration consumed by vite.config.ts.
 *
 * Exported as data so unit tests can assert the manifest shape without
 * booting Vite. Keep theme colors in sync with src/app.css.
 */

import type { ManifestOptions, VitePWAOptions } from "vite-plugin-pwa";

export const APP_NAME = "Session Manager";
export const APP_SHORT_NAME = "Sessions";
export const APP_DESCRIPTION =
  "Mobile-first board-game session tracker with XP, achievements and live voting.";
export const THEME_COLOR = "#0f172a";
export const ACCENT_COLOR = "#6366f1";

export const PWA_MANIFEST: Partial<ManifestOptions> = {
  name: APP_NAME,
  short_name: APP_SHORT_NAME,
  description: APP_DESCRIPTION,
  theme_color: THEME_COLOR,
  background_color: THEME_COLOR,
  display: "standalone",
  orientation: "portrait",
  scope: "/",
  start_url: "/",
  lang: "es",
  icons: [
    {
      src: "icons/icon.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any",
    },
    {
      src: "icons/icon-maskable.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "maskable",
    },
  ],
};

export const PWA_OPTIONS: Partial<VitePWAOptions> = {
  registerType: "autoUpdate",
  strategies: "generateSW",
  injectRegister: "auto",
  manifest: PWA_MANIFEST,
  workbox: {
    globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
    // Anything under /api/ goes to the network — never cache business data.
    navigateFallbackDenylist: [/^\/api\//, /^\/_\//],
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/,
        handler: "CacheFirst",
        options: {
          cacheName: "fonts-cache",
          expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },
    ],
  },
  devOptions: { enabled: false },
};
