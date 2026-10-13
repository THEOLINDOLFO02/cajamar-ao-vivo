// Coleta as estações pluviométricas do CEMADEN para Cajamar e região e grava data/cemaden.json.
// Roda no GitHub Actions (o navegador não consegue ler o CEMADEN direto: o servidor não libera CORS).
// Sem dependências: usa o fetch do Node 18+.
import { writeFile, mkdir } from "node:fs/promises";

const URL_FONTE = "https://resources.cemaden.gov.br/graficos/interativo/getJson2.php?uf=SP";
// Cajamar e municípios da região (códigos IBGE).
const IBGE = [3509205, 3547304, 3509007, 3515004, 3516408, 3525904, 3539103, 3505708];
const SAIDA = process.argv[2] || "data/cemaden.json";

// "13/10/26 14:10" -> número comparável (AAMMDDHHMM). Sem converter fuso: ver nota no README.
function chave(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/.exec(String(texto || ""));
  return m ? Number(m[3] + m[2] + m[1] + m[4] + m[5]) : null;
}
function minutos(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/.exec(String(texto || ""));
  return m ? Date.UTC(2000 + +m[3], +m[2] - 1, +m[1], +m[4], +m[5]) / 60000 : null;
}
// "-" ou vazio significa sem dado (não é zero).
function valor(v) {
  if (v === null || v === undefined || v === "-" || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const ctl = new AbortController();
const t = setTimeout(() => ctl.abort(), 30000);
let bruto;
try {
  const r = await fetch(URL_FONTE, { signal: ctl.signal, headers: { "User-Agent": "cajamar-ao-vivo (projeto pessoal, Defesa Civil de Cajamar)" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  bruto = await r.json();
} finally { clearTimeout(t); }
if (!Array.isArray(bruto) || bruto.length < 50) throw new Error("resposta do CEMADEN em formato inesperado");

// Referência de "agora" na própria rede: a leitura mais recente de todo o estado.
const todas = bruto.map((x) => minutos(x.datahoraUltimovalor)).filter((x) => x !== null);
const referencia = Math.max(...todas);
const refTexto = bruto.find((x) => minutos(x.datahoraUltimovalor) === referencia).datahoraUltimovalor;

const estacoes = bruto
  .filter((x) => IBGE.includes(Number(x.codibge)))
  .map((x) => {
    const m = minutos(x.datahoraUltimovalor);
    return {
      id: x.idestacao, ibge: Number(x.codibge), cidade: x.cidade, nome: x.nomeestacao,
      tipo: x.tipoestacao, status: x.status,
      leitura: x.datahoraUltimovalor || null,
      minutosAntes: m === null ? null : referencia - m,
      ultimo: valor(x.ultimovalor),
      acc: { h1: valor(x.acc1hr), h3: valor(x.acc3hr), h6: valor(x.acc6hr), h12: valor(x.acc12hr), h24: valor(x.acc24hr), h48: valor(x.acc48hr), h72: valor(x.acc72hr), h96: valor(x.acc96hr) }
    };
  })
  .sort((a, b) => (a.ibge === 3509205 ? 0 : 1) - (b.ibge === 3509205 ? 0 : 1) || a.cidade.localeCompare(b.cidade, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));

await mkdir(SAIDA.split("/").slice(0, -1).join("/") || ".", { recursive: true });
await writeFile(SAIDA, JSON.stringify({
  coletadoEm: new Date().toISOString(), fonte: URL_FONTE, referenciaRede: refTexto, estacoes
}, null, 1));
console.log(`OK: ${estacoes.length} estações; leitura mais recente da rede: ${refTexto}`);
