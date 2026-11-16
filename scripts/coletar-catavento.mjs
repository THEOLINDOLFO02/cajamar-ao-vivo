// Coleta as estações e réguas do sistema municipal de Cajamar (https://cajamar.catavento-surya.com/)
// por raspagem/leitura da página e grava data/catavento.json para uso do painel e dos alertas do Telegram.
import { writeFile, rename, mkdir, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { lerCatavento, URL_CATAVENTO, USER_AGENT } from "../worker/cemaden-proxy.js";

export async function coletar({ buscar = fetch, url = process.env.CATAVENTO_URL || URL_CATAVENTO, agora = new Date(), timeoutMs = 20000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await buscar(url, { signal: ctl.signal, headers: { "User-Agent": USER_AGENT } });
    if (!r.ok) throw new Error("Catavento-Surya respondeu HTTP " + r.status);
    const texto = await r.text();
    const estacoes = lerCatavento(texto);
    return { coletadoEm: agora.toISOString(), fonte: url, estacoes };
  } finally {
    clearTimeout(t);
  }
}

export async function coletarEGravar(caminho = "data/catavento.json", opcoes) {
  const saida = await coletar(opcoes);
  await mkdir(dirname(caminho), { recursive: true });
  const tmp = caminho + ".tmp";
  try {
    await writeFile(tmp, JSON.stringify(saida, null, 1));
    await rename(tmp, caminho);
  } catch (e) {
    await unlink(tmp).catch(() => {});
    throw e;
  }
  return saida;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const s = await coletarEGravar(process.argv[2] || "data/catavento.json");
  console.log("OK: " + s.estacoes.length + " equipamento(s) lido(s) do Catavento-Surya (" + s.estacoes.map((e) => e.nome).join(", ") + ")");
}
