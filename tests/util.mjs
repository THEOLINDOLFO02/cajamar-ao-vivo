// Auxiliares dos testes: carrega scripts "de navegador" (que usam window) dentro de um contexto isolado do Node.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

export function carregarScript(caminhoRelativo) {
  const janela = {};
  runInNewContext(readFileSync(join(RAIZ, caminhoRelativo), "utf8"), { window: janela, console }, { filename: caminhoRelativo });
  return janela;
}

// Carrega vários scripts no MESMO contexto, com window igual ao objeto global (um script enxerga o que o outro definiu).
export function carregarScripts(caminhos) {
  const ctx = { console };
  ctx.window = ctx;
  for (const c of caminhos) runInNewContext(readFileSync(join(RAIZ, c), "utf8"), ctx, { filename: c });
  return ctx;
}
