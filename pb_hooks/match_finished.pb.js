/// <reference path="../pb_data/types.d.ts" />
/**
 * When a co-host transitions a match from "playing" to "done",
 * compute XP + achievement unlocks for every match_player and persist.
 *
 * All business logic lives in pb_hooks/_core.js (bundled from src/lib/core).
 * This hook is pure glue: read state, call core, write state.
 */

onRecordAfterUpdateSuccess((e) => {
  try {
    const match = e.record;
    if (match.get("status") !== "done") {
      return e.next();
    }
    // Idempotency: only fire once on the playing -> done transition.
    const previous = e.record.original();
    if (previous && previous.get("status") === "done") {
      return e.next();
    }

    const core = require(`${__hooks}/_core.js`);

    const gameId = match.get("game");
    const durationSeconds = match.get("duration_seconds") || 0;

    const playerRecords = $app.findRecordsByFilter(
      "match_players",
      `match = "${match.id}"`,
      "",
      200,
      0,
    );

    const outcome = {
      matchId: match.id,
      gameId: gameId,
      durationSeconds: durationSeconds,
      players: playerRecords.map((p) => ({
        userId: p.get("player"),
        won: p.get("won") === true,
        rating: p.get("rating"),
      })),
    };

    const statsByUser = {};
    const alreadyUnlocked = {};

    for (const p of playerRecords) {
      const uid = p.get("player");
      const filter = `player = "${uid}" && match.status = "done" && match.id != "${match.id}"`;

      const historyOnGame = $app.findRecordsByFilter(
        "match_players",
        `${filter} && match.game = "${gameId}"`,
        "",
        5000,
        0,
      );
      let winsOnGame = 0;
      let lossesOnGame = 0;
      for (const h of historyOnGame) {
        if (h.get("won") === true) winsOnGame++;
        else lossesOnGame++;
      }

      const recent = $app.findRecordsByFilter(
        "match_players",
        filter,
        "-created",
        30,
        0,
      );
      let streakWins = 0;
      let streakLosses = 0;
      for (const r of recent) {
        const won = r.get("won") === true;
        if (streakWins === 0 && streakLosses === 0) {
          if (won) streakWins = 1;
          else streakLosses = 1;
          continue;
        }
        if (won && streakWins > 0) streakWins++;
        else if (!won && streakLosses > 0) streakLosses++;
        else break;
      }

      const allWins = $app.findRecordsByFilter(
        "match_players",
        `${filter} && won = true`,
        "",
        10000,
        0,
      );

      statsByUser[uid] = {
        userId: uid,
        totalWins: allWins.length,
        winsOnGame: winsOnGame,
        lossesOnGame: lossesOnGame,
        currentStreakWins: streakWins,
        currentStreakLosses: streakLosses,
      };

      const unlocked = $app.findRecordsByFilter(
        "player_achievements",
        `player = "${uid}" && achievement.game = "${gameId}"`,
        "",
        5000,
        0,
      );
      alreadyUnlocked[uid] = new Set(unlocked.map((r) => r.get("achievement")));
    }

    const achievementDefs = $app
      .findRecordsByFilter("achievements", `game = "${gameId}" && status = "approved"`, "", 500, 0)
      .map((a) => ({
        id: a.id,
        triggerExpr: a.get("trigger_expr"),
        rarity: a.get("rarity"),
      }));

    const awards = core.computeMatchAwards(
      outcome,
      statsByUser,
      achievementDefs,
      alreadyUnlocked,
    );

    const playerAchColl = $app.findCollectionByNameOrId("player_achievements");
    const now = new DateTime();

    for (const aw of awards) {
      const player = $app.findRecordById("players", aw.userId);
      const newXp = (player.get("xp") || 0) + aw.xpDelta;
      player.set("xp", newXp);
      player.set("level", core.levelFromXp(newXp));
      $app.save(player);

      for (const achId of aw.unlockedAchievementIds) {
        const pa = new Record(playerAchColl);
        pa.set("player", aw.userId);
        pa.set("achievement", achId);
        pa.set("unlocked_at", now);
        $app.save(pa);
      }
    }
  } catch (err) {
    console.log(`[match_finished] error: ${err}`);
  }
  e.next();
}, "matches");
