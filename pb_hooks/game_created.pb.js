/// <reference path="../pb_data/types.d.ts" />
/**
 * On game creation, call Claude to generate 6 achievements and save them
 * as `achievements` records linked to the game.
 *
 * The network call uses PocketBase's $http.send (sync). Prompt building
 * and response parsing are delegated to pb_hooks/_core.js.
 *
 * Requires env var ANTHROPIC_API_KEY. If unset, we skip silently so
 * PocketBase remains usable in local dev without leaking errors.
 */

onRecordAfterCreateSuccess((e) => {
  try {
    const game = e.record;
    const apiKey = $os.getenv("ANTHROPIC_API_KEY");
    if (!apiKey) {
      console.log("[game_created] ANTHROPIC_API_KEY not set, skipping achievement generation");
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
  const body = core.buildClaudeRequest(prompt);

  let res;
  try {
    res = $http.send({
      url: "https://api.anthropic.com/v1/messages",
      method: "POST",
      timeout: 45,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: body,
    });
  } catch (err) {
    console.log(`[game_created] Claude API call failed: ${err}`);
    return;
  }

  if (res.statusCode < 200 || res.statusCode >= 300) {
    console.log(`[game_created] Claude returned ${res.statusCode}: ${res.raw}`);
    return;
  }

  let parsedResponse;
  try {
    parsedResponse = JSON.parse(res.raw);
  } catch (err) {
    console.log(`[game_created] Could not parse Claude response: ${err}`);
    return;
  }

  const text = core.extractClaudeText(parsedResponse);
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
