/**
 * Svelte readable store mirroring the PocketBase auth state for the
 * current player. Subscribers are notified whenever the underlying
 * authStore changes (login, logout, token refresh).
 */

import { readable, type Readable } from "svelte/store";
import type { PlayersRecord } from "../core/records.js";
import { pb } from "../pb.js";

function snapshot(): PlayersRecord | null {
  return (pb().authStore.record as PlayersRecord | null) ?? null;
}

export const user: Readable<PlayersRecord | null> = readable<PlayersRecord | null>(
  snapshot(),
  (set) => {
    const unsubscribe = pb().authStore.onChange(() => {
      set(snapshot());
    });
    return unsubscribe;
  },
);
