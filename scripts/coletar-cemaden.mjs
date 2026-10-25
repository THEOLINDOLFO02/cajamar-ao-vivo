// Coleta as estações pluviométricas do CEMADEN para Cajamar e região e grava data/cemaden.json.
// Roda no GitHub Actions (o navegador não consegue ler o CEMADEN direto: o servidor não libera CORS).
// A regra de filtro, formato e tentativas fica em worker/cemaden-proxy.js, a mesma usada pelo Worker da Cloudflare.
// Sem dependências: usa o fetch do Node 18+.
import { writeFile, rename, mkdir, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { montar, buscarBruto } from "../worker/cemaden-proxy.js";

export async function coletarEGravar(caminhoSaida = "data/cemaden.json", opcoesBusca = { timeoutMs: 30000 }) {
  const saida = montar(await buscarBruto(opcoesBusca));
  if (!saida.estacoes.length) {
    throw new Error("nenhuma estação dos municípios configurados na resposta; mantendo o arquivo anterior");
  }

  // Grava num arquivo temporário e renomeia: uma falha no meio nunca deixa o JSON pela metade.
  await mkdir(dirname(caminhoSaida), { recursive: true });
  const tmp = caminhoSaida + ".tmp";
  try {
    await writeFile(tmp, JSON.stringify(saida, null, 1));
    await rename(tmp, caminhoSaida);
  } catch (e) {
    await unlink(tmp).catch(() => {});
    throw e;
  }
  return saida;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const SAIDA = process.argv[2] || "data/cemaden.json";
  const saida = await coletarEGravar(SAIDA);
  console.log(`OK: ${saida.estacoes.length} estações; leitura mais recente da rede: ${saida.referenciaRede}`);
}
