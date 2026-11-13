// Coleta as estações do CGE (Prefeitura de São Paulo) mais próximas de Cajamar e grava data/cge.json.
// Roda no GitHub Actions: o CGE não tem API nem CORS e recusou os servidores da Cloudflare (HTTP 503).
// A leitura da página fica em worker/cemaden-proxy.js (lerPostoCge). O CGE não informa a hora da medição:
// "coletadoEm" é a hora da coleta, não a da leitura.
import { writeFile, rename, mkdir, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { lerPostoCge, POSTOS_CGE, USER_AGENT } from "../worker/cemaden-proxy.js";

const URL_CGE = "https://www.cgesp.org/v3/estacao.jsp?POSTO=";

export async function coletar({ buscar = fetch, agora = new Date(), timeoutMs = 20000 } = {}) {
  const postos = {}, falhas = {};
  for (const id of Object.keys(POSTOS_CGE)) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await buscar(URL_CGE + id, { signal: ctl.signal, headers: { "User-Agent": USER_AGENT } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      postos[id] = { nome: POSTOS_CGE[id], fonte: URL_CGE + id, ...lerPostoCge(await r.text()) };
    } catch (e) { falhas[id] = String(e && e.message ? e.message : e); }
    finally { clearTimeout(t); }
  }
  if (!Object.keys(postos).length) throw new Error("nenhum posto do CGE pôde ser lido: " + JSON.stringify(falhas));
  return { coletadoEm: agora.toISOString(), horaDaLeituraInformada: false, postos, falhas };
}

export async function coletarEGravar(caminho = "data/cge.json", opcoes) {
  const saida = await coletar(opcoes);
  await mkdir(dirname(caminho), { recursive: true });
  const tmp = caminho + ".tmp";
  try { await writeFile(tmp, JSON.stringify(saida, null, 1)); await rename(tmp, caminho); }
  catch (e) { await unlink(tmp).catch(() => {}); throw e; }
  return saida;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const s = await coletarEGravar(process.argv[2] || "data/cge.json");
  console.log("OK: postos lidos " + Object.keys(s.postos).join(", ") + (Object.keys(s.falhas).length ? "; falhas: " + JSON.stringify(s.falhas) : ""));
}
