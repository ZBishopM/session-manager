/// <reference path="../pb_data/types.d.ts" />
/**
 * When a co-host transitions a match from "playing" to "done",
 * compute XP + achievement unlocks for every match_player and persist.
 *
 * All business logic lives in pb_hooks/_core.js (bundled from src/lib/core).
 * This hook is pure glue: read state, call core, write state.
 */

onRecordAfterUpdateSuccess((e) => {
  const match = e.record;
  if (match.get("status") !== "done") {
    return;
  }
  // Only fire on the transition into "done" — ignore later edits.
  const original = e.record.originalCopy();
  if (original && original.get("status") === "done") {
    return;
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
      userId: p.get("user"),
      won: p.get("won") === true,
      liked: p.get("liked"),
    })),
  };

  const statsByUser = {};
  const alreadyUnlocked = {};

  for (const p of playerRecords) {
    const uid = p.get("user");
    const filter = `user = "${uid}" && match.status = "done" && match.id != "${match.id}"`;

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
      "user_achievements",
      `user = "${uid}" && achievement.game = "${gameId}"`,
      "",
      5000,
      0,
    );
    alreadyUnlocked[uid] = new Set(unlocked.map((r) => r.get("achievement")));
  }

  const achievementDefs = $app
    .findRecordsByFilter("achievements", `game = "${gameId}"`, "", 500, 0)
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

  const userAchColl = $app.findCollectionByNameOrId("user_achievements");
  const now = new DateTime();

  for (const aw of awards) {
    const user = $app.findRecordById("users", aw.userId);
    const newXp = (user.get("xp") || 0) + aw.xpDelta;
    user.set("xp", newXp);
    user.set("level", core.levelFromXp(newXp));
    $app.save(user);

    for (const achId of aw.unlockedAchievementIds) {
      const ua = new Record(userAchColl);
      ua.set("user", aw.userId);
      ua.set("achievement", achId);
      ua.set("unlocked_at", now);
      $app.save(ua);
    }
  }
}, "matches");
