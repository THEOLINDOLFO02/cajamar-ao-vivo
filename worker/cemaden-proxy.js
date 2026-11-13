// Cloudflare Worker: proxy de leitura do CEMADEN para o painel Cajamar ao Vivo.
// O servidor do CEMADEN não libera CORS, então o navegador não lê direto. Este Worker busca, filtra
// Cajamar e região, e devolve o MESMO formato de data/cemaden.json, com CORS só para o site permitido.
// Sem banco, sem dependências. Plano gratuito da Cloudflare é suficiente (cache de 5 min).

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

// Os horários do CEMADEN não trazem fuso. Evidência (coleta de 30/10/2026): a estação de Cajamar tinha leitura 16:00 com a
// coleta às 16:03 UTC, e várias estações da rede tinham leituras 16:40 a 17:00, ou seja, À FRENTE do relógio. Por isso o horário
// é tratado como UTC e leituras mais de TOLERANCIA_FUTURO_MIN adiante da coleta NÃO entram na "referência da rede" (relógio
// errado da estação). Se nenhuma leitura recente (até 6 h antes da coleta) for coerente com UTC, o fuso fica "não confirmado" e a
// referência continua sendo a maior leitura (comportamento anterior), sinalizado em fusoConfirmado=false.
export const TOLERANCIA_FUTURO_MIN = 10;
const JANELA_COERENCIA_MIN = 360;

export function montar(bruto, agora = new Date()) {
  if (!Array.isArray(bruto) || bruto.length < 50) throw new Error("resposta do CEMADEN em formato inesperado");
  const coletaMin = Math.floor(agora.getTime() / 60000);
  const todas = bruto.map((x) => minutos(x.datahoraUltimovalor)).filter((x) => x !== null);
  const naoFuturas = todas.filter((m) => m <= coletaMin + TOLERANCIA_FUTURO_MIN);
  const fusoConfirmado = naoFuturas.some((m) => coletaMin - m <= JANELA_COERENCIA_MIN);
  const candidatas = fusoConfirmado ? naoFuturas : todas;
  const referencia = candidatas.length ? candidatas.reduce((a, b) => (b > a ? b : a), -Infinity) : null;
  const leiturasFuturas = fusoConfirmado ? todas.length - naoFuturas.length : 0;
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
        leituraFutura: fusoConfirmado && m !== null && m > coletaMin + TOLERANCIA_FUTURO_MIN,
        ultimo: valor(x.ultimovalor),
        acc: { h1: valor(x.acc1hr), h3: valor(x.acc3hr), h6: valor(x.acc6hr), h12: valor(x.acc12hr), h24: valor(x.acc24hr), h48: valor(x.acc48hr), h72: valor(x.acc72hr), h96: valor(x.acc96hr) }
      };
    })
    .sort((a, b) => (a.ibge === 3509205 ? 0 : 1) - (b.ibge === 3509205 ? 0 : 1) || String(a.cidade || "").localeCompare(String(b.cidade || ""), "pt-BR") || String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
  return { coletadoEm: agora.toISOString(), fonte: URL_FONTE, referenciaRede: refTexto, fusoConfirmado, leiturasFuturas, estacoes };
}

// ---- Estações do CGE (Prefeitura de São Paulo), lidas por raspagem de página (o CGE não oferece API nem CORS) ----
// Só postos desta lista são consultados (o Worker não vira um proxy aberto). Santana de Parnaíba é o mais próximo de Cajamar.
export const POSTOS_CGE = { "1000880": "Santana de Parnaíba", "504": "Perus", "515": "Pirituba" };
const URL_CGE = "https://www.cgesp.org/v3/estacao.jsp?POSTO=";
const ENTIDADES = { aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", atilde: "ã", otilde: "õ", ccedil: "ç", acirc: "â", ecirc: "ê", deg: "°", nbsp: " ", amp: "&" };

function numeroCge(txt, min, max) {
  if (txt === undefined || txt === null) return null;
  const n = parseFloat(String(txt).replace(",", "."));
  return Number.isFinite(n) && n >= min && n <= max ? n : null; // fora do plausível = sem dado (nunca vira zero)
}

// Lê o texto da página estacao.jsp do CGE. Campo ausente ou fora do intervalo plausível fica null.
export function lerPostoCge(html) {
  if (typeof html !== "string" || html.length < 200) throw new Error("página do CGE vazia ou em formato inesperado");
  const t = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&([a-z]+);/gi, (m, e) => (ENTIDADES[e.toLowerCase()] !== undefined ? ENTIDADES[e.toLowerCase()] : " ")).replace(/\s+/g, " ");
  const N = "(-?\\d+(?:[.,]\\d+)?)";
  const trio = (unid) => new RegExp("Atual:\\s*" + N + "\\s*" + unid + "\\s*M.xima:\\s*" + N + "\\s*" + unid + "\\s*M.nima:\\s*" + N + "\\s*" + unid, "i").exec(t);
  const temp = trio("°C"), umid = trio("%"), pres = trio("hPa");
  const chuva = new RegExp("Per\\. Atual:\\s*" + N + "\\s*mm\\s*Per\\. Anterior:\\s*" + N + "\\s*mm(?:\\s*Zeramento:\\s*(\\d{2}:\\d{2}))?", "i").exec(t);
  const vento = new RegExp("Dire..o:\\s*([A-Z]{1,3})\\s*Velocidade:\\s*" + N + "\\s*km/h\\s*Rajada:\\s*" + N + "\\s*km/h", "i").exec(t);
  const g = (m, i, a, b) => (m ? numeroCge(m[i], a, b) : null);
  const r = {
    chuva: { atual: g(chuva, 1, 0, 600), anterior: g(chuva, 2, 0, 600), zeramento: chuva && chuva[3] ? chuva[3] : null },
    temperatura: { atual: g(temp, 1, -15, 55), max: g(temp, 2, -15, 55), min: g(temp, 3, -15, 55) },
    umidade: { atual: g(umid, 1, 0, 100), max: g(umid, 2, 0, 100), min: g(umid, 3, 0, 100) },
    pressao: { atual: g(pres, 1, 800, 1100), max: g(pres, 2, 800, 1100), min: g(pres, 3, 800, 1100) },
    vento: { direcao: vento ? vento[1].toUpperCase() : null, velocidade: g(vento, 2, 0, 300), rajada: g(vento, 3, 0, 300) }
  };
  const algum = [r.chuva.atual, r.chuva.anterior, r.temperatura.atual, r.umidade.atual, r.pressao.atual, r.vento.velocidade].some((v) => v !== null);
  if (!algum) throw new Error("não encontrei nenhuma medição na página do CGE (o layout pode ter mudado)");
  return r;
}

async function rotaCge(request, env, cors) {
  const json = { ...cors, "Content-Type": "application/json; charset=utf-8" };
  const posto = new URL(request.url).searchParams.get("posto") || "1000880";
  if (!Object.prototype.hasOwnProperty.call(POSTOS_CGE, posto)) {
    return new Response(JSON.stringify({ erro: "posto não autorizado" }), { status: 400, headers: { ...json, "Cache-Control": "no-store" } });
  }
  const buscar = env && typeof env.buscar === "function" ? env.buscar : fetch;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await buscar(URL_CGE + posto, { signal: ctl.signal, headers: { "User-Agent": USER_AGENT }, cf: { cacheTtl: 300, cacheEverything: true } });
    if (!r.ok) throw new Error("CGE respondeu HTTP " + r.status);
    const dados = lerPostoCge(await r.text());
    // A página do CGE NÃO informa a hora da leitura: "consultadoEm" é a hora desta consulta, não a da medição.
    const corpo = JSON.stringify({ posto, nome: POSTOS_CGE[posto], fonte: URL_CGE + posto, consultadoEm: new Date().toISOString(), horaDaLeituraInformada: false, ...dados });
    return new Response(request.method === "HEAD" ? null : corpo, { headers: { ...json, "Cache-Control": "public, max-age=120, stale-while-revalidate=300", "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    const msg = e && e.name === "AbortError" ? "CGE não respondeu em 10 s" : String(e && e.message ? e.message : e);
    return new Response(JSON.stringify({ erro: msg }), { status: 502, headers: { ...json, "Cache-Control": "no-store" } });
  } finally { clearTimeout(t); }
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
    if (new URL(request.url).pathname === "/cge") return rotaCge(request, env, cors);
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
