/**
 * Weekly matchmaking: groups host and player availability into candidate
 * sessions. Pure and deterministic given a rand() function, so it's fully
 * unit-testable without touching PocketBase — the cron hook (
 * pb_hooks/weekly_matchmaker.pb.js) is thin glue that reads availabilities,
 * calls this, and writes the results back.
 */

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type TimeSlot = "morning" | "afternoon" | "evening" | "night";

export const WEEKDAY_LABEL_ES: Record<Weekday, string> = {
  mon: "lunes",
  tue: "martes",
  wed: "miércoles",
  thu: "jueves",
  fri: "viernes",
  sat: "sábado",
  sun: "domingo",
};

export const TIME_SLOT_LABEL_ES: Record<TimeSlot, string> = {
  morning: "mañana",
  afternoon: "tarde",
  evening: "noche",
  night: "madrugada",
};

// Generated record types (records.ts) always widen select fields to
// include "" (a build-types.ts quirk — it appends "" to every maxSelect:1
// select regardless of `required`), even though weekday/time_slot are
// required and never actually empty at runtime. These accept that wider
// string type so callers don't need `as Weekday` casts at every call site.
export function weekdayLabelEs(weekday: string): string {
  return (WEEKDAY_LABEL_ES as Record<string, string>)[weekday] ?? weekday;
}

export function timeSlotLabelEs(slot: string): string {
  return (TIME_SLOT_LABEL_ES as Record<string, string>)[slot] ?? slot;
}

export interface AvailabilityInput {
  id: string;
  player: string;
  role: "host" | "player";
  weekday: Weekday;
  time_slot: TimeSlot;
  /** Host rows only. */
  capacity?: number;
  /** Player rows only. null/undefined = no preference. */
  max_group_size?: number;
}

export interface MatchGroup {
  host: string;
  weekday: Weekday;
  time_slot: TimeSlot;
  /** Player ids this host is compatible with, in assignment order. */
  players: string[];
}

/**
 * Groups this week's availabilities into candidate (host, players[]) pairs
 * per weekday+time_slot.
 *
 * Per slot: hosts are considered in descending capacity order (a simple,
 * deterministic v1 default — no fairness/rotation across weeks yet, see
 * pendientes/gamesessions.md). For each host, players are greedily
 * assigned if their max_group_size (if set) can fit 1 host + however many
 * players are already assigned to that host + this candidate, and the
 * player isn't already assigned to another host this same slot. A host
 * with zero compatible players is skipped entirely — no proposal, no
 * notification spam.
 */
export function groupAvailabilities(
  availabilities: readonly AvailabilityInput[],
): MatchGroup[] {
  const bySlot = new Map<string, AvailabilityInput[]>();
  for (const a of availabilities) {
    const key = `${a.weekday}|${a.time_slot}`;
    const list = bySlot.get(key) ?? [];
    list.push(a);
    bySlot.set(key, list);
  }

  const groups: MatchGroup[] = [];

  for (const [, slotRows] of bySlot) {
    const hosts = slotRows
      .filter((r) => r.role === "host")
      .sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0));
    const players = slotRows.filter((r) => r.role === "player");
    const claimed = new Set<string>();

    for (const host of hosts) {
      const capacity = host.capacity ?? Infinity;
      const assigned: string[] = [];

      for (const candidate of players) {
        if (assigned.length >= capacity) break;
        if (claimed.has(candidate.player)) continue;
        if (candidate.player === host.player) continue; // can't join your own slot as a guest

        const wouldBeGroupSize = 1 /* host */ + assigned.length + 1 /* candidate */;
        const cap = candidate.max_group_size;
        if (cap != null && wouldBeGroupSize > cap) continue;

        assigned.push(candidate.player);
        claimed.add(candidate.player);
      }

      if (assigned.length > 0) {
        groups.push({
          host: host.player,
          weekday: host.weekday,
          time_slot: host.time_slot,
          players: assigned,
        });
      }
    }
  }

  return groups;
}
