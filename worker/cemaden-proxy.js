// Cloudflare Worker: proxy de leitura do CEMADEN para o painel Cajamar ao Vivo.
// O servidor do CEMADEN não libera CORS, então o navegador não lê direto. Este Worker busca, filtra
// Cajamar e região, e devolve o MESMO formato de data/cemaden.json, com CORS só para o site permitido.
// Sem chaves, sem banco, sem dependências. Plano gratuito da Cloudflare é suficiente (cache de 5 min).

export const URL_FONTE = "https://resources.cemaden.gov.br/graficos/interativo/getJson2.php?uf=SP";
// Cajamar e municípios da região (códigos IBGE). O robô do GitHub (scripts/coletar-cemaden.mjs) usa este mesmo arquivo.
export const IBGE = [3509205, 3547304, 3509007, 3515004, 3516408, 3525904, 3539103, 3505708];
// Sites autorizados a ler este proxy pelo navegador.
const ORIGENS = ["https://theolindolfo02.github.io", "http://localhost:8765", "http://localhost:3000"];

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

export function montar(bruto, agora = new Date()) {
  if (!Array.isArray(bruto) || bruto.length < 50) throw new Error("resposta do CEMADEN em formato inesperado");
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
  return { coletadoEm: agora.toISOString(), fonte: URL_FONTE, referenciaRede: refTexto, estacoes };
}

export default {
  async fetch(request) {
    const origem = request.headers.get("Origin");
    const cors = { "Vary": "Origin" };
    if (origem && ORIGENS.includes(origem)) {
      cors["Access-Control-Allow-Origin"] = origem;
      cors["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return new Response("Método não permitido", { status: 405, headers: cors });
    try {
      // A Cloudflare guarda a resposta do CEMADEN por 5 min: protege o CEMADEN e acelera o painel.
      const r = await fetch(URL_FONTE, {
        headers: { "User-Agent": "cajamar-ao-vivo (projeto pessoal, Defesa Civil de Cajamar)" },
        cf: { cacheTtl: 300, cacheEverything: true }
      });
      if (!r.ok) throw new Error("CEMADEN respondeu HTTP " + r.status);
      const corpo = montar(await r.json());
      return new Response(JSON.stringify(corpo), {
        headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=120" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ erro: String(e && e.message ? e.message : e) }), {
        status: 502, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    }
  }
};
