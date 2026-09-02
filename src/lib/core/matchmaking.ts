/**
 * Weekly matchmaking: groups host and player availability into candidate
 * sessions. Pure and deterministic given a rand() function, so it's fully
 * unit-testable without touching PocketBase — the cron hook (
 * pb_hooks/weekly_matchmaker.pb.js) is thin glue that reads availabilities,
 * calls this, and writes the results back.
 */

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export const WEEKDAY_LABEL_ES: Record<Weekday, string> = {
  mon: "lunes",
  tue: "martes",
  wed: "miércoles",
  thu: "jueves",
  fri: "viernes",
  sat: "sábado",
  sun: "domingo",
};

// Generated record types (records.ts) always widen select fields to
// include "" (a build-types.ts quirk — it appends "" to every maxSelect:1
// select regardless of `required`), even though weekday is required and
// never actually empty at runtime. This accepts that wider string type so
// callers don't need `as Weekday` casts at every call site.
export function weekdayLabelEs(weekday: string): string {
  return (WEEKDAY_LABEL_ES as Record<string, string>)[weekday] ?? weekday;
}

/** Zero-padded 24h range, e.g. formatHourRange(18, 23) -> "18:00–23:00". */
export function formatHourRange(startHour: number, endHour: number): string {
  const pad = (h: number) => String(h % 24).padStart(2, "0");
  return `${pad(startHour)}:00–${pad(endHour)}:00`;
}

/**
 * Minimum overlap (in hours) between a host's and a player's range for
 * them to be considered compatible — a 1-2h sliver of overlap isn't
 * enough for an actual game session.
 */
export const MIN_OVERLAP_HOURS = 3;

export interface AvailabilityInput {
  id: string;
  player: string;
  role: "host" | "player";
  weekday: Weekday;
  /** Half-open [start_hour, end_hour) range, whole-hour granularity. */
  start_hour: number;
  end_hour: number;
  /** Host rows only. */
  capacity?: number;
  /** Player rows only. null/undefined = no preference. */
  max_group_size?: number;
}

export interface MatchGroup {
  host: string;
  weekday: Weekday;
  /** The host's own range — the proposed session time. */
  start_hour: number;
  end_hour: number;
  /** Player ids this host is compatible with, in assignment order. */
  players: string[];
}

function overlapHours(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
}

/**
 * Groups this week's availabilities into candidate (host, players[]) pairs
 * per weekday. The proposed session time is always the host's own range —
 * a player is compatible if their range overlaps it by at least
 * MIN_OVERLAP_HOURS, not necessarily fully contained in it.
 *
 * Per weekday: hosts are considered in descending capacity order (a
 * simple, deterministic v1 default — no fairness/rotation across weeks
 * yet, see pendientes/gamesessions.md). For each host, players are
 * greedily assigned if their max_group_size (if set) can fit 1 host +
 * however many players are already assigned to that host + this
 * candidate, and the player isn't already assigned to another host this
 * same weekday. A host with zero compatible players is skipped entirely —
 * no proposal, no notification spam.
 */
export function groupAvailabilities(
  availabilities: readonly AvailabilityInput[],
): MatchGroup[] {
  const byWeekday = new Map<Weekday, AvailabilityInput[]>();
  for (const a of availabilities) {
    const list = byWeekday.get(a.weekday) ?? [];
    list.push(a);
    byWeekday.set(a.weekday, list);
  }

  const groups: MatchGroup[] = [];

  for (const [, dayRows] of byWeekday) {
    const hosts = dayRows
      .filter((r) => r.role === "host")
      .sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0));
    const players = dayRows.filter((r) => r.role === "player");
    const claimed = new Set<string>();

    for (const host of hosts) {
      const capacity = host.capacity ?? Infinity;
      const assigned: string[] = [];

      for (const candidate of players) {
        if (assigned.length >= capacity) break;
        if (claimed.has(candidate.player)) continue;
        if (candidate.player === host.player) continue; // can't join your own slot as a guest

        const overlap = overlapHours(host.start_hour, host.end_hour, candidate.start_hour, candidate.end_hour);
        if (overlap < MIN_OVERLAP_HOURS) continue;

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
          start_hour: host.start_hour,
          end_hour: host.end_hour,
          players: assigned,
        });
      }
    }
  }

  return groups;
}
