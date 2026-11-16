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

// ---- Portal Municipal Catavento-Surya de Cajamar (https://cajamar.catavento-surya.com/ e https://cajamar-meteorologia.catavento-surya.com/) ----
export const URL_CATAVENTO = "https://cajamar.catavento-surya.com/";
export const URL_CATAVENTO_LOGIN = "https://cajamar-meteorologia.catavento-surya.com/login";
export const URL_CATAVENTO_PAINEL = "https://cajamar-meteorologia.catavento-surya.com/";

function normalizarItemCatavento(raw, idx = 0) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.sn || raw.id || raw.codigo || raw.serial || raw.alias || raw.nome || raw.name || ("est_" + (idx + 1))).trim();
  const nome = String(raw.alias || raw.nome || raw.name || raw.estacao || id).trim();
  const catBruta = String(raw.category || raw.tipo || "").toLowerCase();
  const ehNivel = /nivel|nível|hidro|fluv|regua|régua/.test(catBruta) || (/natura|jordan/i.test(nome) && raw.water_level_m !== undefined && raw.temperature_c === undefined);
  const pick = (chaves, min, max) => {
    for (const k of chaves) {
      if (raw[k] !== undefined && raw[k] !== null && raw[k] !== "") {
        const v = numeroCge(raw[k], min, max);
        if (v !== null) return v;
      }
    }
    return null;
  };
  const chuvaObj = raw.chuva && typeof raw.chuva === "object" ? raw.chuva : (raw.acc && typeof raw.acc === "object" ? raw.acc : {});
  const h1 = pick(["chuva1h", "acc1h", "chuva_1h", "rain_1h", "c60", "intensity_mm", "rain_interval_mm"], 0, 500) ?? numeroCge(chuvaObj.h1 ?? chuvaObj.atual, 0, 500);
  const h24 = pick(["chuva24h", "acc24h", "chuva_24h", "rain_24h", "accumulated_mm", "chuva_dia", "chuva"], 0, 1000) ?? numeroCge(chuvaObj.h24 ?? chuvaObj.dia, 0, 1000);
  const h72 = pick(["chuva72h", "acc72h", "chuva_72h", "rain_72h"], 0, 1500) ?? numeroCge(chuvaObj.h72, 0, 1500);
  const h168 = pick(["chuva168h", "acc168h", "chuva_168h", "rain_168h"], 0, 2000) ?? numeroCge(chuvaObj.h168, 0, 2000);
  const temperatura = pick(["temperatura", "temperature_c", "temp", "temperatura_c", "tmax"], -50, 60);
  const umidade = pick(["umidade", "humidity_percent", "umid", "humidity"], 0, 100);
  const pressao = pick(["pressao", "pressure_hpa", "pressao_hpa", "pressure"], 300, 1100);
  const vento = pick(["vento", "wind_speed_kmh", "vento_kmh", "wind_speed", "vmax"], 0, 400);
  const rajada = pick(["rajada", "wind_gust_kmh", "rajada_kmh", "gust_kmh"], 0, 400);
  const direcao = pick(["direcao", "wind_direction_degrees", "wind_dir"], 0, 360);
  const nivelRio = pick(["nivelRio", "water_level_m", "nivel_m", "water_level", "nvMax", "nivel"], 0, 30);
  const variacaoNivelM = pick(["variacaoNivelM", "nvDelta", "water_level_delta_m", "delta_m"], 0, 20);
  const radiacao = pick(["radiacao", "solar_radiation_wm2", "radiacao_wm2", "radmax"], 0, 2000);
  const leitura = String(raw.leitura || raw.data_hora_brt || raw.data_hora || raw.updatedAt || raw.ultimoRegistro || "").trim() || null;

  const temValor = [h1, h24, h72, h168, temperatura, umidade, pressao, vento, rajada, nivelRio, radiacao].some((v) => v !== null);
  if (!temValor) return null;
  return {
    id,
    nome,
    tipo: ehNivel ? "nivel" : "meteorologica",
    leitura,
    chuva1h: h1,
    chuva24h: h24,
    chuva72h: h72,
    chuva168h: h168,
    temperatura,
    umidade,
    pressao,
    vento,
    rajada,
    direcao,
    nivelRio,
    variacaoNivelM,
    radiacao
  };
}

function extrairListaJsonCatavento(obj) {
  if (!obj || typeof obj !== "object") return [];
  if (Array.isArray(obj)) return obj.map(normalizarItemCatavento).filter(Boolean);
  for (const k of ["estacoes", "stations", "devices", "equipamentos", "dados", "data", "items"]) {
    if (Array.isArray(obj[k])) {
      const l = obj[k].map(normalizarItemCatavento).filter(Boolean);
      if (l.length) return l;
    }
  }
  if (obj.props && obj.props.pageProps) {
    const sub = extrairListaJsonCatavento(obj.props.pageProps);
    if (sub.length) return sub;
  }
  return [];
}

// Lê dados das estações de https://cajamar.catavento-surya.com/ (suporta JSON, CSV de exportação ou raspagem HTML).
export function lerCatavento(conteudo) {
  if (typeof conteudo !== "string" || conteudo.trim().length < 10) {
    throw new Error("resposta vazia do sistema Catavento-Surya");
  }
  const txt = conteudo.trim();

  // 1) Se for JSON direto
  if (txt.startsWith("{") || txt.startsWith("[")) {
    try {
      const parsed = JSON.parse(txt);
      const lista = extrairListaJsonCatavento(parsed);
      if (lista.length) return lista;
    } catch (e) { /* segue para outros formatos */ }
  }

  // 2) Se for CSV do Catavento-Surya (delimitador ';')
  const primeiraLinha = txt.replace(/^\uFEFF/, "").split(/\r?\n/)[0] || "";
  if (primeiraLinha.includes(";") && (primeiraLinha.includes("data_hora_brt") || primeiraLinha.includes("rain_interval_mm") || primeiraLinha.includes("water_level_m"))) {
    const linhas = txt.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
    const cab = linhas[0].split(";").map((c) => c.trim());
    const idx = {};
    cab.forEach((c, i) => { idx[c] = i; });
    const porEst = new Map();
    for (let i = 1; i < linhas.length; i++) {
      const c = linhas[i].split(";");
      const sn = (idx.sn !== undefined && c[idx.sn] ? c[idx.sn].trim() : "") || "est";
      const alias = (idx.alias !== undefined && c[idx.alias] ? c[idx.alias].trim() : "") || sn;
      const cat = idx.category !== undefined && c[idx.category] ? c[idx.category].trim() : "";
      const dh = idx.data_hora_brt !== undefined && c[idx.data_hora_brt] ? c[idx.data_hora_brt].trim() : "";
      const chave = sn + "|" + alias;
      if (!porEst.has(chave)) porEst.set(chave, { sn, alias, category: cat, rows: [] });
      porEst.get(chave).rows.push({
        dh,
        ch: idx.rain_interval_mm !== undefined ? numeroCge(c[idx.rain_interval_mm], 0, 500) : null,
        acc: idx.accumulated_mm !== undefined ? numeroCge(c[idx.accumulated_mm], 0, 1000) : null,
        intMm: idx.intensity_mm !== undefined ? numeroCge(c[idx.intensity_mm], 0, 500) : null,
        t: idx.temperature_c !== undefined ? numeroCge(c[idx.temperature_c], -50, 60) : null,
        u: idx.humidity_percent !== undefined ? numeroCge(c[idx.humidity_percent], 0, 100) : null,
        p: idx.pressure_hpa !== undefined ? numeroCge(c[idx.pressure_hpa], 300, 1100) : null,
        v: idx.wind_speed_kmh !== undefined ? numeroCge(c[idx.wind_speed_kmh], 0, 400) : null,
        dir: idx.wind_direction_degrees !== undefined ? numeroCge(c[idx.wind_direction_degrees], 0, 360) : null,
        nv: idx.water_level_m !== undefined ? numeroCge(c[idx.water_level_m], 0, 30) : null,
        rad: idx.solar_radiation_wm2 !== undefined ? numeroCge(c[idx.solar_radiation_wm2], 0, 2000) : null
      });
    }
    const saidaCsv = [];
    for (const g of porEst.values()) {
      const ult = g.rows[g.rows.length - 1];
      const somaCh = g.rows.reduce((s, r) => s + (r.ch || 0), 0);
      const nvs = g.rows.map((r) => r.nv).filter((v) => v !== null);
      const nvMin = nvs.length ? Math.min(...nvs) : null;
      const nvMax = nvs.length ? Math.max(...nvs) : null;
      const item = normalizarItemCatavento({
        sn: g.sn,
        alias: g.alias,
        category: g.category,
        data_hora_brt: ult.dh,
        chuva1h: ult.intMm !== null && ult.intMm > 0 ? ult.intMm : ult.ch,
        chuva24h: ult.acc !== null && ult.acc > 0 ? ult.acc : Math.round(somaCh * 10) / 10,
        temperature_c: ult.t,
        humidity_percent: ult.u,
        pressure_hpa: ult.p,
        wind_speed_kmh: ult.v,
        wind_direction_degrees: ult.dir,
        water_level_m: nvMax !== null ? nvMax : ult.nv,
        variacaoNivelM: nvMax !== null && nvMin !== null ? Math.round((nvMax - nvMin) * 100) / 100 : null,
        solar_radiation_wm2: ult.rad
      });
      if (item) saidaCsv.push(item);
    }
    if (saidaCsv.length) return saidaCsv;
  }

  // 3) Raspagem de HTML: verifica primeiro JSON embutido em <script> (__NEXT_DATA__ ou estado inicial)
  const rxScriptJson = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let mScr;
  while ((mScr = rxScriptJson.exec(txt)) !== null) {
    const corpo = mScr[1].trim();
    if (corpo.startsWith("{") || corpo.startsWith("[")) {
      try {
        const l = extrairListaJsonCatavento(JSON.parse(corpo));
        if (l.length) return l;
      } catch (e) { /* continua */ }
    }
    const mAssign = /(?:__INITIAL_STATE__|__NEXT_DATA__|stations|estacoes)\s*=\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*;?/.exec(corpo);
    if (mAssign) {
      try {
        const l2 = extrairListaJsonCatavento(JSON.parse(mAssign[1]));
        if (l2.length) return l2;
      } catch (e) { /* continua */ }
    }
  }

  // 4) Raspagem direta de blocos HTML por estação (cards, linhas de tabela ou seções)
  const limpo = txt
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/&([a-z]+);/gi, (m, e) => (ENTIDADES[e.toLowerCase()] !== undefined ? ENTIDADES[e.toLowerCase()] : " "));

  const NUM = "(-?\\d+(?:[.,]\\d+)?)";
  function rasparBlocoTexto(bloco, nomePadrao, idx) {
    const t = bloco.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const mCh1 = new RegExp("(?:chuva\\s*(?:1\\s*h|hor[aá]ria|atual|intervalo)|intensidade|1\\s*h)\\s*:?\\s*" + NUM + "\\s*mm", "i").exec(t);
    const mCh24 = new RegExp("(?:chuva\\s*(?:24\\s*h|acumulad[ao]|dia)|acumulado(?:\\s*24\\s*h)?|24\\s*h)\\s*:?\\s*" + NUM + "\\s*mm", "i").exec(t);
    const mCh72 = new RegExp("(?:72\\s*h)\\s*:?\\s*" + NUM + "\\s*mm", "i").exec(t);
    const mCh168 = new RegExp("(?:168\\s*h|7\\s*d(?:ias)?)\\s*:?\\s*" + NUM + "\\s*mm", "i").exec(t);
    const mChGen = !mCh1 && !mCh24 ? new RegExp("(?:chuva|precipita[cç][aã]o)\\s*:?\\s*" + NUM + "\\s*mm", "i").exec(t) : null;
    const mTemp = new RegExp("(?:temp(?:eratura)?)\\s*:?\\s*" + NUM + "\\s*°?\\s*C|" + NUM + "\\s*°C", "i").exec(t);
    const mUmid = new RegExp("(?:umid(?:ade)?(?:\\s*relativa)?)\\s*:?\\s*" + NUM + "\\s*%|" + NUM + "\\s*%\\s*(?:UR|umid)", "i").exec(t);
    const mPres = new RegExp("(?:press[aã]o)\\s*:?\\s*" + NUM + "\\s*hPa|" + NUM + "\\s*hPa", "i").exec(t);
    const mVento = new RegExp("(?:vento|velocidade)\\s*:?\\s*" + NUM + "\\s*km/h|" + NUM + "\\s*km/h", "i").exec(t);
    const mRaj = new RegExp("(?:rajada)\\s*:?\\s*" + NUM + "\\s*km/h", "i").exec(t);
    const mNivel = new RegExp("(?:n[ií]vel(?:\\s*do\\s*rio|\\s*d['’]?[aá]gua)?|r[eé]gua|cota)\\s*:?\\s*" + NUM + "\\s*m\\b", "i").exec(t);
    const mRad = new RegExp("(?:radia[cç][aã]o)\\s*:?\\s*" + NUM + "\\s*W/m|" + NUM + "\\s*W/m", "i").exec(t);
    const mHora = /(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}(?::\d{2})?|\d{2}:\d{2})/.exec(t);

    const valTemp = mTemp ? (mTemp[1] || mTemp[2]) : null;
    const valUmid = mUmid ? (mUmid[1] || mUmid[2]) : null;
    const valPres = mPres ? (mPres[1] || mPres[2]) : null;
    const valVento = mVento ? (mVento[1] || mVento[2]) : null;
    const valRad = mRad ? (mRad[1] || mRad[2]) : null;

    return normalizarItemCatavento({
      id: nomePadrao.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      nome: nomePadrao,
      tipo: mNivel && !valTemp ? "nivel" : "meteorologica",
      leitura: mHora ? mHora[1] : null,
      chuva1h: mCh1 ? mCh1[1] : (mChGen ? mChGen[1] : null),
      chuva24h: mCh24 ? mCh24[1] : null,
      chuva72h: mCh72 ? mCh72[1] : null,
      chuva168h: mCh168 ? mCh168[1] : null,
      temperatura: valTemp,
      umidade: valUmid,
      pressao: valPres,
      vento: valVento,
      rajada: mRaj ? mRaj[1] : null,
      nivelRio: mNivel ? mNivel[1] : null,
      radiacao: valRad
    }, idx);
  }

  // Procura blocos nomeados das estações conhecidas de Cajamar ou blocos <article>/<section>/<div data-estacao>
  const padroesEstacoes = [
    { nome: "EMEB Karine", rx: /EMEB\s+Karine/i },
    { nome: "EMEB Maria", rx: /EMEB\s+Maria/i },
    { nome: "GCM Vila Nova", rx: /GCM\s+Vila\s+Nova|Vila\s+Nova|Polvilho/i },
    { nome: "EMEB Guilhermina", rx: /EMEB\s+Guilhermina|KM\s*43/i },
    { nome: "GCM Ponunduva", rx: /GCM\s+Ponunduva|Ponunduva/i },
    { nome: "Régua Jordanésia", rx: /R[eé]gua\s+Jordan[eé]sia|N[ií]vel\s+Jordan[eé]sia|Jordan[eé]sia/i },
    { nome: "Régua Natura", rx: /R[eé]gua\s+Natura|N[ií]vel\s+Natura|Natura/i }
  ];

  const estacoesHtml = [];
  const posicoes = [];
  for (const p of padroesEstacoes) {
    const m = p.rx.exec(limpo);
    if (m) posicoes.push({ nome: p.nome, pos: m.index });
  }
  posicoes.sort((a, b) => a.pos - b.pos);
  for (let i = 0; i < posicoes.length; i++) {
    const ini = posicoes[i].pos;
    const fim = i + 1 < posicoes.length ? posicoes[i + 1].pos : Math.min(limpo.length, ini + 1500);
    const item = rasparBlocoTexto(limpo.slice(ini, fim), posicoes[i].nome, i);
    if (item) estacoesHtml.push(item);
  }
  if (estacoesHtml.length) return estacoesHtml;

  // Fallback: página única com medições gerais de Cajamar
  const unico = rasparBlocoTexto(limpo, "Estação Cajamar (Catavento-Surya)", 0);
  if (unico) return [unico];

  throw new Error("não foi possível extrair leituras da página do Catavento-Surya (verifique se exige login ou se o formato mudou)");
}

async function rotaCatavento(request, env, cors) {
  const json = { ...cors, "Content-Type": "application/json; charset=utf-8" };
  const buscar = env && typeof env.buscar === "function" ? env.buscar : fetch;
  const urlAlvo = (env && env.CATAVENTO_URL) || URL_CATAVENTO;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await buscar(urlAlvo, { signal: ctl.signal, headers: { "User-Agent": USER_AGENT } });
    if (!r.ok) throw new Error("Catavento-Surya respondeu HTTP " + r.status);
    const estacoes = lerCatavento(await r.text());
    const corpo = JSON.stringify({ coletadoEm: new Date().toISOString(), fonte: urlAlvo, estacoes });
    return new Response(request.method === "HEAD" ? null : corpo, {
      headers: { ...json, "Cache-Control": "public, max-age=120, stale-while-revalidate=300", "X-Content-Type-Options": "nosniff" }
    });
  } catch (e) {
    const msg = e && e.name === "AbortError" ? "Catavento-Surya não respondeu em 12 s" : String(e && e.message ? e.message : e);
    return new Response(JSON.stringify({ erro: msg }), { status: 502, headers: { ...json, "Cache-Control": "no-store" } });
  } finally { clearTimeout(t); }
}

// ---- 2.6 Sincronização em Nuvem entre Celulares e Computadores da Equipe (/sync) ----
// Armazena o estado operacional (ocorrências, observações, cotas do rio e resumo das estações) em Cloudflare KV
// (binding CAJAMAR_SYNC) ou em memória de borda (fallback imediato se o KV ainda não estiver vinculado).
const MEMORIA_SYNC = new Map();

function chaveSalaValida(chave) {
  return typeof chave === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(chave.trim());
}

async function lerEstadoSync(env, sala) {
  const k = "sync:" + sala;
  if (env && env.CAJAMAR_SYNC && typeof env.CAJAMAR_SYNC.get === "function") {
    const txt = await env.CAJAMAR_SYNC.get(k);
    return txt ? JSON.parse(txt) : null;
  }
  return MEMORIA_SYNC.get(k) || null;
}

async function gravarEstadoSync(env, sala, obj) {
  const k = "sync:" + sala;
  const txt = JSON.stringify(obj);
  if (env && env.CAJAMAR_SYNC && typeof env.CAJAMAR_SYNC.put === "function") {
    await env.CAJAMAR_SYNC.put(k, txt);
    return "kv";
  }
  MEMORIA_SYNC.set(k, obj);
  return "memoria_edge";
}

export function mesclarPacotesSync(atual, novo) {
  const base = atual && typeof atual === "object" ? atual : { ocorrencias: [], observacoes: [], cotasRio: null, estacoesResumo: null };
  const inc = novo && typeof novo === "object" ? novo : {};

  // Mescla ocorrências por id (mantém a versão mais recente por atualizadoEm / criadoEm)
  const mapaOc = new Map();
  (Array.isArray(base.ocorrencias) ? base.ocorrencias : []).forEach((o) => { if (o && o.id) mapaOc.set(o.id, o); });
  (Array.isArray(inc.ocorrencias) ? inc.ocorrencias : []).forEach((o) => {
    if (!o || !o.id) return;
    const ex = mapaOc.get(o.id);
    if (!ex) { mapaOc.set(o.id, o); return; }
    const tNovo = Date.parse(o.atualizadoEm || o.criadoEm || o.quando || 0) || 0;
    const tEx = Date.parse(ex.atualizadoEm || ex.criadoEm || ex.quando || 0) || 0;
    if (tNovo >= tEx) mapaOc.set(o.id, o);
  });
  const ocorrencias = [...mapaOc.values()].sort((a, b) => (Date.parse(b.quando || 0) || 0) - (Date.parse(a.quando || 0) || 0)).slice(0, 500);

  // Mescla observações manuais por id
  const mapaOb = new Map();
  (Array.isArray(base.observacoes) ? base.observacoes : []).forEach((o) => { if (o && o.id) mapaOb.set(o.id, o); });
  (Array.isArray(inc.observacoes) ? inc.observacoes : []).forEach((o) => { if (o && o.id) mapaOb.set(o.id, o); });
  const observacoes = [...mapaOb.values()].sort((a, b) => String(b.quando || "").localeCompare(String(a.quando || ""))).slice(0, 500);

  return {
    atualizadoEm: new Date().toISOString(),
    dispositivo: String(inc.dispositivo || base.dispositivo || "equipe").slice(0, 60),
    ocorrencias,
    observacoes,
    cotasRio: inc.cotasRio || base.cotasRio || null,
    areasRiscoCustom: inc.areasRiscoCustom || base.areasRiscoCustom || null,
    estacoesResumo: inc.estacoesResumo || base.estacoesResumo || null
  };
}

async function rotaSync(request, env, cors) {
  const json = { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  const url = new URL(request.url);
  const sala = (request.headers.get("X-Equipe-Chave") || url.searchParams.get("sala") || "").trim();
  if (!chaveSalaValida(sala)) {
    return new Response(JSON.stringify({ erro: "Informe um código da equipe válido (4 a 64 letras/números)." }), { status: 400, headers: json });
  }
  if (env && env.SYNC_SECRET && sala !== env.SYNC_SECRET) {
    return new Response(JSON.stringify({ erro: "Código da equipe não autorizado neste servidor." }), { status: 403, headers: json });
  }
  if (request.method === "GET") {
    const estado = await lerEstadoSync(env, sala);
    return new Response(JSON.stringify({
      ok: true,
      sala,
      dados: estado || { atualizadoEm: null, ocorrencias: [], observacoes: [], cotasRio: null, estacoesResumo: null }
    }), { status: 200, headers: json });
  }
  if (request.method === "POST") {
    try {
      const texto = await request.text();
      if (texto.length > 1500000) {
        return new Response(JSON.stringify({ erro: "Pacote excede 1,5 MB." }), { status: 413, headers: json });
      }
      const pacote = JSON.parse(texto);
      const atual = await lerEstadoSync(env, sala);
      const mesclado = mesclarPacotesSync(atual, pacote);
      const backend = await gravarEstadoSync(env, sala, mesclado);
      return new Response(JSON.stringify({ ok: true, backend, dados: mesclado }), { status: 200, headers: json });
    } catch (e) {
      return new Response(JSON.stringify({ erro: "JSON inválido no envio de sincronização." }), { status: 400, headers: json });
    }
  }
  return new Response(JSON.stringify({ erro: "Método não permitido em /sync" }), { status: 405, headers: json });
}

// ---- 2.7 Disparo de Alertas para o Telegram (/alerta-telegram) ----
async function rotaTelegram(request, env, cors) {
  const json = { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ erro: "Use POST para enviar alerta ao Telegram." }), { status: 405, headers: json });
  }
  try {
    const body = await request.json();
    const botToken = (body.botToken || (env && env.TELEGRAM_BOT_TOKEN) || "").trim();
    const chatId = (body.chatId || (env && env.TELEGRAM_CHAT_ID) || "").trim();
    const texto = String(body.texto || "").trim();
    if (!botToken || !chatId || !texto) {
      return new Response(JSON.stringify({ erro: "Informe botToken, chatId e texto." }), { status: 400, headers: json });
    }
    const buscar = env && typeof env.buscar === "function" ? env.buscar : fetch;
    const r = await buscar("https://api.telegram.org/bot" + botToken + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: "Markdown", disable_web_page_preview: true })
    });
    const respJson = await r.json().catch(() => ({}));
    if (!r.ok || respJson.ok === false) {
      return new Response(JSON.stringify({ erro: respJson.description || ("Telegram HTTP " + r.status) }), { status: 502, headers: json });
    }
    return new Response(JSON.stringify({ ok: true, messageId: respJson.result && respJson.result.message_id }), { status: 200, headers: json });
  } catch (e) {
    return new Response(JSON.stringify({ erro: String(e && e.message ? e.message : e) }), { status: 500, headers: json });
  }
}

export default {
  async fetch(request, env = {}) {
    const origem = request.headers.get("Origin");
    const cors = { "Vary": "Origin" };
    if (origemPermitida(origem)) {
      cors["Access-Control-Allow-Origin"] = origem;
      cors["Access-Control-Allow-Methods"] = "GET, HEAD, POST, OPTIONS";
      cors["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Equipe-Chave";
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const urlReq = new URL(request.url);
    if (urlReq.pathname === "/sync") return rotaSync(request, env, cors);
    if (urlReq.pathname === "/alerta-telegram") return rotaTelegram(request, env, cors);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Método não permitido", { status: 405, headers: cors });
    }
    if (urlReq.pathname === "/cge") return rotaCge(request, env, cors);
    if (urlReq.pathname === "/catavento") return rotaCatavento(request, env, cors);
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
