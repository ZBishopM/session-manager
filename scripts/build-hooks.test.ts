import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { buildHooks } from "./build-hooks.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BUNDLE_PATH = join(ROOT, "pb_hooks", "_core.js");

describe("hooks bundle", () => {
  beforeAll(async () => {
    await buildHooks();
  });

  it("produces pb_hooks/_core.js", () => {
    expect(existsSync(BUNDLE_PATH)).toBe(true);
  });

  it("exposes the documented public API", async () => {
    const require = createRequire(import.meta.url);
    delete require.cache[require.resolve(BUNDLE_PATH)];
    const core = require(BUNDLE_PATH) as Record<string, unknown>;
    expect(typeof core.computeMatchAwards).toBe("function");
    expect(typeof core.evaluateTrigger).toBe("function");
    expect(typeof core.resolveVotes).toBe("function");
    expect(typeof core.levelFromXp).toBe("function");
    expect(typeof core.xpForAction).toBe("function");
    expect(typeof core.emptyStats).toBe("function");
    expect(typeof core.progressToNextLevel).toBe("function");
    expect(core.RANDOM_VOTE).toBe("__random__");
  });

  it("bundled computeMatchAwards matches the source-of-truth behavior", () => {
    const require = createRequire(import.meta.url);
    const core = require(BUNDLE_PATH) as {
      computeMatchAwards: (
        outcome: unknown,
        statsByUser: unknown,
        achievements: unknown,
        alreadyUnlocked: unknown,
      ) => Array<{ userId: string; xpDelta: number }>;
    };
    const result = core.computeMatchAwards(
      {
        matchId: "m",
        gameId: "g",
        durationSeconds: 60,
        players: [{ userId: "u1", won: true }],
      },
      {},
      [],
      {},
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.userId).toBe("u1");
    expect(result[0]!.xpDelta).toBe(25); // participate(10) + win(15)
  });

  it("bundle does not contain ES module syntax (Goja-safe)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(BUNDLE_PATH, "utf8");
    // Heuristic: a CJS bundle shouldn't have top-level `import ` or `export `.
    // Inside strings these can appear, so check for module-level statements.
    expect(src).not.toMatch(/^import\s+/m);
    expect(src).not.toMatch(/^export\s+(?:default|\{|const|function|class)/m);
  });
});
