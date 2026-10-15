// Coleta as estações pluviométricas do CEMADEN para Cajamar e região e grava data/cemaden.json.
// Roda no GitHub Actions (o navegador não consegue ler o CEMADEN direto: o servidor não libera CORS).
// A regra de filtro e formato fica em worker/cemaden-proxy.js (montar), a mesma usada pelo Worker da Cloudflare.
// Sem dependências: usa o fetch do Node 18+.
import { writeFile, mkdir } from "node:fs/promises";
import { montar, URL_FONTE } from "../worker/cemaden-proxy.js";

const SAIDA = process.argv[2] || "data/cemaden.json";

const ctl = new AbortController();
const t = setTimeout(() => ctl.abort(), 30000);
let bruto;
try {
  const r = await fetch(URL_FONTE, { signal: ctl.signal, headers: { "User-Agent": "cajamar-ao-vivo (projeto pessoal, Defesa Civil de Cajamar)" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  bruto = await r.json();
} finally { clearTimeout(t); }

const saida = montar(bruto);
await mkdir(SAIDA.split("/").slice(0, -1).join("/") || ".", { recursive: true });
await writeFile(SAIDA, JSON.stringify(saida, null, 1));
console.log(`OK: ${saida.estacoes.length} estações; leitura mais recente da rede: ${saida.referenciaRede}`);
