// Cloudflare Worker: proxy de leitura do CEMADEN para o painel Cajamar ao Vivo.
// O servidor do CEMADEN não libera CORS, então o navegador não lê direto. Este Worker busca, filtra
// Cajamar e região, e devolve o MESMO formato de data/cemaden.json, com CORS só para o site permitido.
// Sem banco, sem dependências. Plano gratuito da Cloudflare é suficiente (cache de 5 min).
// Rota extra /windy: previsão pontual da Windy para Cajamar. A chave fica no secret WINDY_POINT_KEY do Worker
// (nunca neste arquivo nem no site): veja worker/README.md.

export const URL_FONTE = "https://resources.cemaden.gov.br/graficos/interativo/getJson2.php?uf=SP";
// Cajamar e municípios da região (códigos IBGE). O robô do GitHub (scripts/coletar-cemaden.mjs) usa este mesmo arquivo.
export const IBGE = [3509205, 3547304, 3509007, 3515004, 3516408, 3525904, 3539103, 3505708];
// Sites autorizados a ler este proxy pelo navegador (produção + qualquer porta local de desenvolvimento).
const ORIGENS = ["https://theolindolfo02.github.io", "http://localhost:8765", "http://localhost:3000"];

export function origemPermitida(origem) {
  if (!origem || typeof origem !== "string") return false;
  if (ORIGENS.includes(origem)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem);
}

export const USER_AGENT = "cajamar-ao-vivo (projeto pessoal, Defesa Civil de Cajamar)";

// Busca o JSON bruto do CEMADEN com limite de tempo e novas tentativas (o servidor deles oscila).
// Usada pelo Worker e pelo robô do GitHub; `opcoes` permite injetar fetch/espera nos testes.
export async function buscarBruto({ tentativas = 3, timeoutMs = 15000, esperaMs = 1500, buscar = fetch, extra = {}, dormir = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await buscar(URL_FONTE, { signal: ctl.signal, headers: { "User-Agent": USER_AGENT }, ...extra });
      if (!r.ok) throw new Error("CEMADEN respondeu HTTP " + r.status);
      return await r.json();
    } catch (e) {
      ultimo = e && e.name === "AbortError" ? new Error("CEMADEN não respondeu em " + timeoutMs / 1000 + " s") : e;
    } finally { clearTimeout(t); }
    if (i < tentativas - 1) await dormir(esperaMs * (i + 1));
  }
  throw ultimo;
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

export function montar(bruto, agora = new Date()) {
  if (!Array.isArray(bruto) || bruto.length < 50) throw new Error("resposta do CEMADEN em formato inesperado");
  const todas = bruto.map((x) => minutos(x.datahoraUltimovalor)).filter((x) => x !== null);
  const referencia = todas.length ? todas.reduce((a, b) => (b > a ? b : a), -Infinity) : null;
  const refItem = referencia !== null ? bruto.find((x) => minutos(x.datahoraUltimovalor) === referencia) : null;
  const refTexto = refItem ? refItem.datahoraUltimovalor : null;
  const estacoes = bruto
    .filter((x) => IBGE.includes(Number(x.codibge)))
    .map((x) => {
      const m = minutos(x.datahoraUltimovalor);
      return {
        id: x.idestacao, ibge: Number(x.codibge), cidade: x.cidade, nome: x.nomeestacao,
        tipo: x.tipoestacao, status: x.status,
        leitura: x.datahoraUltimovalor || null,
        minutosAntes: m === null || referencia === null ? null : referencia - m,
        ultimo: valor(x.ultimovalor),
        acc: { h1: valor(x.acc1hr), h3: valor(x.acc3hr), h6: valor(x.acc6hr), h12: valor(x.acc12hr), h24: valor(x.acc24hr), h48: valor(x.acc48hr), h72: valor(x.acc72hr), h96: valor(x.acc96hr) }
      };
    })
    .sort((a, b) => (a.ibge === 3509205 ? 0 : 1) - (b.ibge === 3509205 ? 0 : 1) || String(a.cidade || "").localeCompare(String(b.cidade || ""), "pt-BR") || String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
  return { coletadoEm: agora.toISOString(), fonte: URL_FONTE, referenciaRede: refTexto, estacoes };
}

// ---------- Windy (previsão pontual) ----------
export const URL_WINDY = "https://api.windy.com/api/point-forecast/v2";
export const PONTO_CAJAMAR = { lat: -23.35, lon: -46.88 };
const PARAMETROS_WINDY = ["temp", "precip", "wind", "windGust", "cape", "rh", "lclouds", "mclouds", "hclouds"];

function num(v) { return typeof v === "number" && Number.isFinite(v) ? v : null; }
function arred(v, d) { return v === null ? null : Math.round(v * 10 ** d) / 10 ** d; }

// Converte a resposta da Windy (Kelvin, m/s, metros, componentes u/v) em unidades do dia a dia, em passos de 3 h.
export function montarWindy(bruto, agora = new Date(), maxPassos = 24) {
  if (!bruto || !Array.isArray(bruto.ts) || !bruto.ts.length || !Array.isArray(bruto["temp-surface"])) throw new Error("resposta da Windy em formato inesperado");
  const col = (nome) => (Array.isArray(bruto[nome]) ? bruto[nome] : []);
  const temp = col("temp-surface"), chuva = col("past3hprecip-surface"), u = col("wind_u-surface"), v = col("wind_v-surface");
  const rajada = col("gust-surface"), cape = col("cape-surface"), umid = col("rh-surface");
  const baixas = col("lclouds-surface"), medias = col("mclouds-surface"), altas = col("hclouds-surface");
  const pontos = bruto.ts.slice(0, maxPassos).map((ts, i) => {
    const uu = num(u[i]), vv = num(v[i]), t = num(temp[i]), c = num(chuva[i]), g = num(rajada[i]);
    const vento = uu === null || vv === null ? null : Math.hypot(uu, vv) * 3.6;
    const dir = uu === null || vv === null ? null : (270 - Math.atan2(vv, uu) * 180 / Math.PI + 360) % 360;
    return {
      ts, tempC: t === null ? null : arred(t - 273.15, 1), chuvaMm3h: c === null ? null : arred(Math.max(0, c) * 1000, 1),
      ventoKmh: arred(vento, 0), direcaoGraus: arred(dir, 0), rajadaKmh: g === null ? null : arred(g * 3.6, 0),
      cape: arred(num(cape[i]), 0), umidade: arred(num(umid[i]), 0),
      nuvens: { baixas: arred(num(baixas[i]), 0), medias: arred(num(medias[i]), 0), altas: arred(num(altas[i]), 0) }
    };
  });
  return { coletadoEm: agora.toISOString(), fonte: "Windy Point Forecast (modelo GFS)", modelo: "gfs", passoHoras: 3, aviso: typeof bruto.warning === "string" && bruto.warning ? bruto.warning : null, pontos };
}

// Chama a Windy com limite de tempo. A chave só trafega servidor a servidor e nunca aparece em mensagens de erro.
export async function buscarWindy({ key, lat = PONTO_CAJAMAR.lat, lon = PONTO_CAJAMAR.lon, timeoutMs = 10000, buscar = fetch } = {}) {
  if (!key) throw new Error("Windy não configurado");
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await buscar(URL_WINDY, {
      method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
      body: JSON.stringify({ lat, lon, model: "gfs", parameters: PARAMETROS_WINDY, levels: ["surface"], key })
    });
    if (r.status === 204) throw new Error("a Windy não tem esses parâmetros para o ponto");
    if (!r.ok) throw new Error("Windy respondeu HTTP " + r.status);
    return await r.json();
  } catch (e) {
    throw e && e.name === "AbortError" ? new Error("Windy não respondeu em " + timeoutMs / 1000 + " s") : e;
  } finally { clearTimeout(t); }
}

// Rota /windy. Guarda a resposta 30 min no cache da Cloudflare para poupar o limite de chamadas da chave.
async function rotaWindy(request, env, cors) {
  const json = { ...cors, "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
  const head = request.method === "HEAD";
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chaveCache = new Request(new URL("/windy", request.url).toString(), { method: "GET" });
  try {
    if (!env || !env.WINDY_POINT_KEY) return new Response(head ? null : JSON.stringify({ erro: "Windy não configurado (falta o secret WINDY_POINT_KEY)" }), { status: 503, headers: { ...json, "Cache-Control": "no-store" } });
    let corpo = null;
    const guardado = cache ? await cache.match(chaveCache) : null;
    if (guardado) corpo = await guardado.text();
    if (!corpo) {
      corpo = JSON.stringify(montarWindy(await buscarWindy({ key: env.WINDY_POINT_KEY, buscar: env.buscar || fetch })));
      if (cache) await cache.put(chaveCache, new Response(corpo, { headers: { "Cache-Control": "public, max-age=1800" } }));
    }
    return new Response(head ? null : corpo, { headers: { ...json, "Cache-Control": "public, max-age=600" } });
  } catch (e) {
    const msg = String(e && e.message ? e.message : e).split(env.WINDY_POINT_KEY || " ").join("***");
    return new Response(head ? null : JSON.stringify({ erro: msg }), { status: 502, headers: { ...json, "Cache-Control": "no-store" } });
  }
}

export default {
  async fetch(request, env = {}) {
    const origem = request.headers.get("Origin");
    const cors = { "Vary": "Origin" };
    if (origemPermitida(origem)) {
      cors["Access-Control-Allow-Origin"] = origem;
      cors["Access-Control-Allow-Methods"] = "GET, HEAD, OPTIONS";
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Método não permitido", { status: 405, headers: cors });
    }
    if (new URL(request.url).pathname === "/windy") return rotaWindy(request, env, cors);
    try {
      // A Cloudflare guarda a resposta do CEMADEN por 5 min: protege o CEMADEN e acelera o painel.
      const opcoesBusca = {
        tentativas: 2,
        timeoutMs: 10000,
        extra: { cf: { cacheTtl: 300, cacheEverything: true } }
      };
      if (env && typeof env.buscar === "function") opcoesBusca.buscar = env.buscar;
      const bruto = await buscarBruto(opcoesBusca);
      const corpo = request.method === "HEAD" ? null : JSON.stringify(montar(bruto));
      return new Response(corpo, {
        headers: {
          ...cors,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=120, stale-while-revalidate=300",
          "X-Content-Type-Options": "nosniff"
        }
      });
    } catch (e) {
      const corpoErro = request.method === "HEAD" ? null : JSON.stringify({ erro: String(e && e.message ? e.message : e) });
      return new Response(corpoErro, {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    }
  }
};
