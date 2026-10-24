// Coleta as estações pluviométricas do CEMADEN para Cajamar e região e grava data/cemaden.json.
// Roda no GitHub Actions (o navegador não consegue ler o CEMADEN direto: o servidor não libera CORS).
// A regra de filtro, formato e tentativas fica em worker/cemaden-proxy.js, a mesma usada pelo Worker da Cloudflare.
// Sem dependências: usa o fetch do Node 18+.
import { writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { montar, buscarBruto } from "../worker/cemaden-proxy.js";

const SAIDA = process.argv[2] || "data/cemaden.json";

const saida = montar(await buscarBruto({ timeoutMs: 30000 }));
if (!saida.estacoes.length) throw new Error("nenhuma estação dos municípios configurados na resposta; mantendo o arquivo anterior");

// Grava num arquivo temporário e renomeia: uma falha no meio nunca deixa o JSON pela metade.
await mkdir(dirname(SAIDA), { recursive: true });
const tmp = SAIDA + ".tmp";
await writeFile(tmp, JSON.stringify(saida, null, 1));
await rename(tmp, SAIDA);
console.log(`OK: ${saida.estacoes.length} estações; leitura mais recente da rede: ${saida.referenciaRede}`);
