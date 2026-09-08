import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Cada handler del JSVM de PocketBase corre en una VM de un pool y solo se
 * serializa el cuerpo del callback: nada del nivel superior del fichero de
 * hooks existe cuando el handler se ejecuta. Declarar ahí una función y
 * llamarla desde el callback compila, se despliega y falla en silencio con
 * `ReferenceError`, tragado por el try/catch del propio hook.
 *
 * Ya pasó dos veces en producción y en las dos tardó meses en verse:
 *   - voting_closed.pb.js  -> ninguna votación se cerró nunca
 *   - weekly_matchmaker.pb.js -> el correo semanal no se envió nunca
 *
 * La solución en ambos casos fue mover la lógica a un módulo sin `.pb.` y
 * cargarlo con require() DENTRO del handler. El ámbito superior de un módulo
 * de CommonJS sí sobrevive (_core.js depende de ello); el del fichero de
 * hooks no.
 *
 * Este test existe para que la tercera vez salte aquí y no en producción.
 */

const HOOKS_DIR = join(import.meta.dirname, "..", "pb_hooks");
const TOP_LEVEL_DECL = /^(?:function|const|let|var)\s/m;

const hookFiles = readdirSync(HOOKS_DIR).filter((f) => f.endsWith(".pb.js"));

describe("pb_hooks/*.pb.js", () => {
  it("encuentra los ficheros de hooks", () => {
    expect(hookFiles.length).toBeGreaterThan(0);
  });

  it.each(hookFiles)("%s no declara nada en el nivel superior", (file) => {
    const source = readFileSync(join(HOOKS_DIR, file), "utf8");
    const match = TOP_LEVEL_DECL.exec(source);
    const line = match ? source.slice(0, match.index).split("\n").length : 0;

    expect(
      match?.[0].trim(),
      `${file}:${line} declara en el nivel superior. El handler correrá en otra VM ` +
        `y esto será ReferenceError en producción, tragado por su propio try/catch. ` +
        `Muévelo a un módulo sin ".pb." y cárgalo con require() dentro del handler ` +
        `(ver pb_hooks/voting_close.js).`,
    ).toBeUndefined();
  });
});
