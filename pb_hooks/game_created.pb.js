/// <reference path="../pb_data/types.d.ts" />
/**
 * On game creation, call Gemini to generate 6 achievements and save them
 * as `achievements` records linked to the game.
 *
 * The network call uses PocketBase's $http.send (sync). Prompt building
 * and response parsing are delegated to pb_hooks/_core.js.
 *
 * Requires env var GEMINI_API_KEY. If unset, we skip silently so
 * PocketBase remains usable in local dev without leaking errors.
 */

onRecordAfterCreateSuccess((e) => {
  try {
    const game = e.record;
    const apiKey = $os.getenv("GEMINI_API_KEY");
    if (!apiKey) {
      console.log("[game_created] GEMINI_API_KEY not set, skipping achievement generation");
      return e.next();
    }

  const core = require(`${__hooks}/_core.js`);
  const categoryIds = game.get("categories") || [];
  const categoryNames = [];
  for (const cid of categoryIds) {
    try {
      const cat = $app.findRecordById("categories", cid);
      categoryNames.push(cat.get("name"));
    } catch (_) { /* category removed meanwhile */ }
  }

  const prompt = core.buildPrompt({
    name: game.get("name"),
    description: game.get("description") || "",
    categories: categoryNames,
    minPlayers: game.get("min_players"),
    maxPlayers: game.get("max_players"),
  });
  const body = core.buildGeminiRequest(prompt);

  let res;
  try {
    res = $http.send({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${core.ACHIEVEMENTS_MODEL_DEFAULT}:generateContent?key=${apiKey}`,
      method: "POST",
      timeout: 45,
      headers: {
        "content-type": "application/json",
      },
      body: body,
    });
  } catch (err) {
    console.log(`[game_created] Gemini API call failed: ${err}`);
    return;
  }

  if (res.statusCode < 200 || res.statusCode >= 300) {
    console.log(`[game_created] Gemini returned ${res.statusCode}: ${res.raw}`);
    return;
  }

  let parsedResponse;
  try {
    parsedResponse = JSON.parse(res.raw);
  } catch (err) {
    console.log(`[game_created] Could not parse Gemini response: ${err}`);
    return;
  }

  const text = core.extractGeminiText(parsedResponse);
  const achievements = core.parseAchievements(text);

    if (achievements.length === 0) {
      console.log(`[game_created] No valid achievements parsed for "${game.get("name")}"`);
      return e.next();
    }

    const coll = $app.findCollectionByNameOrId("achievements");
    for (const a of achievements) {
      const rec = new Record(coll);
      rec.set("game", game.id);
      rec.set("title", a.title);
      rec.set("description", a.description);
      rec.set("trigger_expr", a.triggerExpr);
      rec.set("rarity", a.rarity);
      // AI generation is beta — goes through the same pending/approved
      // gate as a player-proposed achievement, not auto-approved.
      rec.set("status", "pending");
      try {
        $app.save(rec);
      } catch (err) {
        console.log(`[game_created] Could not save achievement "${a.title}": ${err}`);
      }
    }

    console.log(`[game_created] Saved ${achievements.length} achievements for "${game.get("name")}"`);
  } catch (err) {
    console.log(`[game_created] error: ${err}`);
  }
  e.next();
}, "games");
