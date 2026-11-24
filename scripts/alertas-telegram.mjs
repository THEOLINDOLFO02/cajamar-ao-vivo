// Robô de Alertas Automáticos em Segundo Plano (2.7) — Defesa Civil de Cajamar/SP.
// Roda no GitHub Actions a cada 10 minutos (ou pela linha de comando) e verifica:
// 1. Avisos ativos do INMET para Cajamar (IBGE 3509205), a partir de ALERTAS_NIVEL_MINIMO (padrão 2 = "Perigo"; 1 = inclui "Perigo Potencial");
// 2. Pluviômetros do CEMADEN em Cajamar com acumulado >= 20 mm/1h ou >= 50 mm/24h;
// 3. Estações e réguas do sistema municipal Catavento-Surya (https://cajamar.catavento-surya.com/) por raspagem,
//    toda vez que mudar de faixa nos parâmetros já estabelecidos (chuva, nível do rio, vento, umidade e temperatura);
// 4. Focos de calor / identificação de fogo no território de Cajamar (INPE BDQueimadas 10 min + diário).
//
// SEM REPETIÇÃO: o robô guarda o que já avisou (data/alertas-estado.json, restaurado pelo cache do GitHub Actions).
// Só manda mensagem quando o alerta é NOVO, AGRAVOU / MUDOU DE FAIXA, e avisa quando ENCERROU. Se uma fonte falhar
// (INMET fora do ar, arquivo do CEMADEN velho, INPE ou Catavento indisponível), os alertas dela ficam como estão: falha de consulta não vira "encerrado".
// Sem TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID (Secrets do repositório) nada é enviado nem gravado: só aparece no log.
// Se o Telegram recusar a mensagem, o estado NÃO é gravado (tenta de novo no próximo ciclo) e o passo avisa no log.

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { lerCatavento, URL_CATAVENTO, URL_CATAVENTO_API_UNIFIED, URL_CATAVENTO_API_UNIFIED_ALT, USER_AGENT } from "../worker/cemaden-proxy.js";

const IBGE_CAJAMAR = 3509205;
const LAT_CAJAMAR = -23.3547;
const LON_CAJAMAR = -46.8764;
const URL_INPE_DIARIO = "https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/diario/Brasil/";
const URL_INPE_10MIN = "https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/10min/";

export const AUSENCIAS_PARA_ENCERRAR = 3;   // 3 ciclos seguidos sem o alerta (~30 min) antes de dizer "encerrado"
export const IDADE_MAX_CEMADEN_MS = 3 * 3600 * 1000;
export const JANELA_FOGO_MS = 24 * 3600 * 1000;
export const INTERVALO_PADRAO_BOLETIM_MIN = 180; // Padrão: boletim automático das estações de 3 em 3 horas (180 min)
const MAX_ITENS_MENSAGEM = 8;

export function nivelDaSeveridade(sev) {
  const s = String(sev || "").toLowerCase();
  if (s.includes("grande")) return 3;
  if (s.includes("potencial")) return 1;
  if (s.includes("perigo")) return 2;
  return 1;
}

export function esc(t) { return String(t === undefined || t === null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// "2026-11-16 08:55" é horário de Brasília (UTC-3, sem horário de verão). Devolve ms ou NaN.
export function msBrt(txt) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(txt || ""));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] + 3, +m[5]) : NaN;
}

// Avisos ativos do INMET que incluem Cajamar: sem encerrados, sem duplicatas e só os que já começaram (ou começam em até 30 min).
export function normalizarAvisosInmet(j, agoraMs = Date.now()) {
  if (!j || !Array.isArray(j.hoje) || !Array.isArray(j.futuro)) return { ok: false, avisos: [] };
  const vistos = {}, avisos = [];
  for (const a of [].concat(j.hoje, j.futuro)) {
    if (!a || a.encerrado) continue;
    const cods = String(a.geocodes || "").replace(/[^0-9,]/g, "").split(",");
    const chave = a.id_aviso + "/" + a.id_sequencia;
    if (!cods.includes(String(IBGE_CAJAMAR)) || vistos[chave]) continue;
    const ini = msBrt(a.inicio), fim = msBrt(a.fim);
    if (!Number.isNaN(ini) && ini > agoraMs + 30 * 60000) continue;      // ainda não começou
    if (!Number.isNaN(fim) && fim < agoraMs) continue;                    // já acabou
    vistos[chave] = 1;
    let riscos = a.riscos;
    try { if (typeof riscos === "string") riscos = JSON.parse(riscos); } catch (e) { riscos = [riscos]; }
    avisos.push({ id: chave, evento: a.descricao || a.evento || "Aviso Meteorológico", severidade: a.severidade || "", inicio: a.inicio || "", fim: a.fim || "", risco: Array.isArray(riscos) ? riscos[0] : (riscos || "") });
  }
  return { ok: true, avisos };
}

const fmt1 = (v, un = "mm") => v.toFixed(1).replace(".", ",") + (un ? " " + un : "");
const fmt2 = (v, un = "m") => v.toFixed(2).replace(".", ",") + (un ? " " + un : "");
const ehNum = (v) => typeof v === "number" && Number.isFinite(v);

// Mapeia o bairro/região de Cajamar para deixar o alerta imediatamente claro para a equipe de plantão
function regiaoEstacaoCajamar(nome, id) {
  const s = ((nome || "") + " " + (id || "")).toLowerCase();
  if (s.includes("vila nova") || s.includes("140070634")) return "Vila Nova / Polvilho";
  if (s.includes("karine") || s.includes("140070637")) return "Polvilho";
  if (s.includes("guilhermina") || s.includes("140070645")) return "KM 43 / Anhanguera";
  if (s.includes("maria") || s.includes("140070655")) return "Ponunduva";
  if (s.includes("ponunduva")) return "Ponunduva";
  if (s.includes("jordan") || s.includes("140070661")) return "Jordanésia / Rio Juquery";
  if (s.includes("natura") || s.includes("140070580")) return "KM 30,5 / Rio Juquery";
  return "Cajamar/SP";
}

export const LIMITE_OFFLINE_ESTACAO_MS = 6 * 3600 * 1000; // 6 horas sem atualizar = estação offline / sem conexão

function formatarIsoParaBrtCurto(iso) {
  if (!iso) return null;
  const s = String(iso).trim();
  const mBr = /^(\d{2})\/(\d{2})\/(\d{4})(?:,?\s+(\d{2}):(\d{2}))?/.exec(s);
  if (mBr) return mBr[1] + "/" + mBr[2] + (mBr[4] ? " " + mBr[4] + ":" + mBr[5] : "");
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).replace(",", "");
}

export function msLeituraEstacao(leitura) {
  if (!leitura) return NaN;
  const s = String(leitura).trim();
  const mBr = /^(\d{2})\/(\d{2})\/(\d{4})(?:,?\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (mBr) {
    return Date.UTC(+mBr[3], +mBr[2] - 1, +mBr[1], (+(mBr[4] || 0)) + 3, +(mBr[5] || 0), +(mBr[6] || 0));
  }
  const ts = Date.parse(s);
  return Number.isNaN(ts) ? NaN : ts;
}

export function estacaoEstaOffline(e, refMs = null) {
  if (!e || !e.leitura || !ehNum(refMs)) return false;
  const ts = msLeituraEstacao(e.leitura);
  if (Number.isNaN(ts)) return false;
  return (refMs - ts) > LIMITE_OFFLINE_ESTACAO_MS;
}

// Monta um resumo de 1 linha com todas as medições atuais de uma estação (para exibir no encerramento e no panorama)
export function resumirMedicoesEstacao(e, refMs = null) {
  if (!e || typeof e !== "object") return "";
  const leitBrt = formatarIsoParaBrtCurto(e.leitura);
  if (estacaoEstaOffline(e, refMs)) {
    return `⚠️ <i>Sem conexão / offline (última transmissão em ${esc(leitBrt || e.leitura)})</i>`;
  }
  const p = [];
  const temp = ehNum(e.temperatura) ? e.temperatura : (ehNum(e.temperature_c) ? e.temperature_c : null);
  const umid = ehNum(e.umidade) ? e.umidade : (ehNum(e.humidity_percent) ? e.humidity_percent : null);
  const h1 = ehNum(e.chuva1h) ? e.chuva1h : (e.acc && ehNum(e.acc.h1) ? e.acc.h1 : null);
  const h24 = ehNum(e.chuva24h) ? e.chuva24h : (e.acc && ehNum(e.acc.h24) ? e.acc.h24 : null);
  const vento = ehNum(e.vento) ? e.vento : (ehNum(e.wind_speed_kmh) ? e.wind_speed_kmh : null);
  const pressao = ehNum(e.pressao) ? e.pressao : (ehNum(e.pressure_hpa) ? e.pressure_hpa : null);
  const nvRio = ehNum(e.nivelRio) ? e.nivelRio : (ehNum(e.water_level_m) ? e.water_level_m : null);
  if (h1 !== null || h24 !== null) {
    const ch = [];
    if (h1 !== null) ch.push(`1h: ${fmt1(h1)}`);
    if (h24 !== null) ch.push(`24h: ${fmt1(h24)}`);
    p.push(`🌧️ Chuva ${ch.join(" / ")}`);
  }
  if (temp !== null) p.push(`🌡️ ${fmt1(temp, "°C")}`);
  if (umid !== null) p.push(`💧 ${Math.round(umid)}%`);
  if (vento !== null) p.push(`💨 Vento ${fmt1(vento, "km/h")}`);
  if (pressao !== null) p.push(`🧭 ${Math.round(pressao)} hPa`);
  if (nvRio !== null) {
    const st = e.statusRio ? ` (${e.statusRio === "normal" ? "Normal" : e.statusRio})` : "";
    p.push(`🌊 Rio: ${fmt2(nvRio)}${st}`);
  }
  if (leitBrt) p.push(`🕒 ${esc(leitBrt)}`);
  return p.join(" · ");
}

// Avalia as estações e réguas do Catavento-Surya seguindo os parâmetros estabelecidos no Guia e no sistema:
// - Chuva: 1h (>=20 Atenção, >=30 Alerta, >=60 Grande Perigo), 24h (>=25 Atenção, >=50 Alerta, >100 Grande Perigo),
//          72h (>=80 Atenção, >=120 Alerta, >200 Alerta Máximo), 168h (>=120 Atenção, >=180 Alerta, >250 Alerta Máximo)
// - Nível do Rio (Réguas Jordanésia e Natura): >=1,80 m ou Δ>=35 cm (Atenção), >=2,30 m ou Δ>=60 cm (Alerta), >=2,80 m (Transbordamento)
// - Vento (Beaufort / INMET): >=39 km/h (Vento forte), >=62 km/h (Ventania), >=89 km/h (Tempestade)
// - Umidade relativa (INMET ar seco): <=30% (Atenção), <20% (Alerta), <12% (Emergência)
// - Temperatura: >=30 °C (Calor), >=36 °C (Calor intenso), <15 °C (Frio), <=10 °C (Frio intenso)
export function avaliarEstacoesCatavento(catavento, cotasRio = null) {
  const alertas = [];
  const lista = catavento && Array.isArray(catavento.estacoes) ? catavento.estacoes : (Array.isArray(catavento) ? catavento : []);
  const cAtencao = (cotasRio && ehNum(cotasRio.atencaoM)) ? cotasRio.atencaoM : 1.80;
  const cAlerta = (cotasRio && ehNum(cotasRio.alertaM)) ? cotasRio.alertaM : 2.30;
  const cTransb = (cotasRio && ehNum(cotasRio.transbordoM)) ? cotasRio.transbordoM : 2.80;
  const dAtencaoCm = (cotasRio && ehNum(cotasRio.deltaAtencaoCm)) ? cotasRio.deltaAtencaoCm : 35;
  const dAlertaCm = (cotasRio && ehNum(cotasRio.deltaAlertaCm)) ? cotasRio.deltaAlertaCm : 60;

  let refRedeMs = catavento && catavento.coletadoEm ? Date.parse(catavento.coletadoEm) : NaN;
  for (const item of lista) {
    const tItem = item && item.leitura ? msLeituraEstacao(item.leitura) : NaN;
    if (!Number.isNaN(tItem) && (Number.isNaN(refRedeMs) || tItem > refRedeMs)) refRedeMs = tItem;
  }

  for (const e of lista) {
    if (!e || typeof e !== "object") continue;
    // Ignora estações desconectadas há mais de 6h em relação à rede (ex.: EMEB Karine e EMEB Maria Gonçalves em manutenção)
    if (!Number.isNaN(refRedeMs) && estacaoEstaOffline(e, refRedeMs)) continue;
    const id = String(e.id || e.sn || e.nome || "est").trim();
    const nome = String(e.nome || e.alias || id).trim();
    const regiao = regiaoEstacaoCajamar(nome, id);
    const leitFormatada = formatarIsoParaBrtCurto(e.leitura);
    const leit = leitFormatada ? ` (Leitura: ${esc(leitFormatada)} BRT)` : "";

    // 1. Chuva
    const h1 = ehNum(e.chuva1h) ? e.chuva1h : (e.acc && ehNum(e.acc.h1) ? e.acc.h1 : null);
    const h24 = ehNum(e.chuva24h) ? e.chuva24h : (e.acc && ehNum(e.acc.h24) ? e.acc.h24 : null);
    const h72 = ehNum(e.chuva72h) ? e.chuva72h : (e.acc && ehNum(e.acc.h72) ? e.acc.h72 : null);
    const h168 = ehNum(e.chuva168h) ? e.chuva168h : (e.acc && ehNum(e.acc.h168) ? e.acc.h168 : null);
    const n1 = h1 === null || h1 < 20 ? 0 : h1 >= 60 ? 3 : h1 >= 30 ? 2 : 1;
    const n24 = h24 === null || h24 < 25 ? 0 : h24 > 100 ? 3 : h24 >= 50 ? 2 : 1;
    const n72 = h72 === null || h72 < 80 ? 0 : h72 > 200 ? 3 : h72 >= 120 ? 2 : 1;
    const n168 = h168 === null || h168 < 120 ? 0 : h168 > 250 ? 3 : h168 >= 180 ? 2 : 1;
    const nvChuva = Math.max(n1, n24, n72, n168);
    if (nvChuva > 0) {
      const rot = nvChuva >= 3 ? "🔴 Grande Perigo / Alerta Máximo" : nvChuva === 2 ? "🟠 Perigo / Alerta" : "🟡 Atenção / Perigo Potencial";
      const partes = [];
      if (h1 !== null) partes.push(`1h: <b>${fmt1(h1)}</b>`);
      if (h24 !== null) partes.push(`24h: <b>${fmt1(h24)}</b>`);
      if (h72 !== null) partes.push(`72h: <b>${fmt1(h72)}</b>`);
      if (h168 !== null) partes.push(`7d: <b>${fmt1(h168)}</b>`);

      const motivos = [];
      if (n1 > 0) motivos.push(`Chuva em 1h (${fmt1(h1)}) ≥ ${n1 >= 3 ? "60" : n1 === 2 ? "30" : "20"} mm/h`);
      if (n24 > 0) motivos.push(`Acumulado 24h (${fmt1(h24)}) ≥ ${n24 >= 3 ? "100" : n24 === 2 ? "50" : "25"} mm/24h`);
      if (n72 > 0) motivos.push(`Acumulado 72h (${fmt1(h72)}) ≥ ${n72 >= 3 ? "200" : n72 === 2 ? "120" : "80"} mm`);
      if (n168 > 0) motivos.push(`Acumulado 7 dias (${fmt1(h168)}) ≥ ${n168 >= 3 ? "250" : n168 === 2 ? "180" : "120"} mm`);

      const acaoChuva = nvChuva >= 3
        ? "Risco elevado de alagamentos e escorregamentos de encosta. Equipes em prontidão máxima; vistoriar áreas críticas."
        : nvChuva === 2
        ? "Solo bastante úmido. Vistoriar pontos de alagamento, drenagem e encostas da região."
        : "Início de umedecimento relevante do solo. Acompanhar evolução nos pluviômetros e radar.";

      alertas.push({
        tipo: "catavento",
        chave: `catavento:chuva:${id}`,
        estacaoId: id,
        estacaoNome: nome,
        parametro: "chuva",
        nivel: nvChuva,
        critico: nvChuva >= 2,
        titulo: `🌧️ <b>CATAVENTO-SURYA (CHUVA — ${rot}) — ${esc(nome)}</b>`,
        detalhe: [
          `📍 <b>Local:</b> ${esc(nome)} (${esc(regiao)})`,
          `📊 <b>Volumes medidos:</b> ${partes.join(" · ")}${leit}`,
          `🎯 <b>Gatilho atingido:</b> ${motivos.join(" e ")}`,
          `🛟 <b>Orientação DC:</b> ${acaoChuva}`
        ].join("\n")
      });
    }

    // 2. Nível do Rio (Somente para Réguas Fluviométricas / estações que realmente medem nível de rio)
    const nvRio = ehNum(e.nivelRio) ? e.nivelRio : (ehNum(e.water_level_m) ? e.water_level_m : null);
    const deltaCm = ehNum(e.variacaoNivelM) ? Math.round(e.variacaoNivelM * 100) : null;
    const ehEstacaoDeRio = nvRio !== null || e.tipo === "nivel" || Boolean(e.statusRio);
    const stRio = ehEstacaoDeRio ? String(e.statusRio || "").toLowerCase() : "";
    const nvStatus = (stRio === "critico" || stRio === "inundacao") ? 3 : stRio === "alerta" ? 2 : stRio === "atencao" ? 1 : 0;
    if (ehEstacaoDeRio && (nvRio !== null || nvStatus > 0)) {
      const nvDelta = deltaCm !== null ? (deltaCm >= dAlertaCm ? 2 : deltaCm >= dAtencaoCm ? 1 : 0) : 0;
      const nvCota = nvRio !== null ? (nvRio >= cTransb ? 3 : nvRio >= cAlerta ? 2 : nvRio >= cAtencao ? 1 : 0) : 0;
      const nvHid = (stRio && !cotasRio) ? Math.max(nvStatus, nvDelta) : Math.max(nvStatus, nvCota, nvDelta);
      if (nvHid > 0) {
        const rotH = nvHid >= 3 ? "🔴 Cota de Transbordamento" : nvHid === 2 ? "🟠 Alerta Hidrológico (Cheia)" : "🟡 Atenção Hidrológica";
        const cotaRefTxt = `Cotas: Atenção ${fmt2(cAtencao)} · Alerta ${fmt2(cAlerta)} · Transbordo ${fmt2(cTransb)}`;
        const acaoRio = nvHid >= 3
          ? "Risco iminente ou ocorrência de extravasamento da calha. Acionar protocolo de inundação e alerta ribeirinho."
          : nvHid === 2
          ? "Elevação acentuada do nível do rio. Vistoriar pontes, passagens baixas e áreas ribeirinhas próximas ao Rio Juquery."
          : "Nível do rio em elevação. Acompanhar próximas leituras da régua e chuva a montante.";
        alertas.push({
          tipo: "catavento",
          chave: `catavento:nivel:${id}`,
          estacaoId: id,
          estacaoNome: nome,
          parametro: "nivel",
          nivel: nvHid,
          critico: nvHid >= 2,
          titulo: `🌊 <b>CATAVENTO-SURYA (${rotH}) — ${esc(nome)}</b>`,
          detalhe: [
            `📍 <b>Régua Fluviométrica:</b> ${esc(nome)} (${esc(regiao)})`,
            `📊 <b>Medição atual:</b> ${nvRio !== null ? `Nível: <b>${fmt2(nvRio)}</b>` : `Status: <b>${esc(stRio)}</b>`}${deltaCm !== null ? ` · Subida no dia (Δ): <b>+${deltaCm} cm</b>` : ""}${h1 !== null || h24 !== null ? ` · Chuva local 24h: ${h24 !== null ? fmt1(h24) : "—"}` : ""}${leit}`,
            `🎯 <b>Referência:</b> ${cotaRefTxt}`,
            `🛟 <b>Orientação DC:</b> ${acaoRio}`
          ].join("\n")
        });
      }
    }

    // 3. Vento / Rajada
    const vento = ehNum(e.vento) ? e.vento : (ehNum(e.wind_speed_kmh) ? e.wind_speed_kmh : null);
    const rajada = ehNum(e.rajada) ? e.rajada : null;
    const vMax = vento !== null && rajada !== null ? Math.max(vento, rajada) : (vento !== null ? vento : rajada);
    if (vMax !== null && vMax >= 39) {
      const nvVento = vMax >= 89 ? 3 : vMax >= 62 ? 2 : 1;
      const rotV = nvVento >= 3 ? "🔴 Tempestade (Beaufort 10+)" : nvVento === 2 ? "🟠 Ventania (Beaufort 8–9)" : "🟡 Vento Forte (Beaufort 6–7)";
      const acaoVento = nvVento >= 2
        ? "Alto risco de queda de árvores, galhos e danos à rede elétrica. Equipes de corte/desobstrução em alerta."
        : "Atenção para rajadas moderadas a fortes; risco de queda de galhos secos e estruturas leves.";
      alertas.push({
        tipo: "catavento",
        chave: `catavento:vento:${id}`,
        estacaoId: id,
        estacaoNome: nome,
        parametro: "vento",
        nivel: nvVento,
        critico: nvVento >= 2,
        titulo: `💨 <b>CATAVENTO-SURYA (${rotV}) — ${esc(nome)}</b>`,
        detalhe: [
          `📍 <b>Local:</b> ${esc(nome)} (${esc(regiao)})`,
          `📊 <b>Velocidade/Rajada medida:</b> <b>${fmt1(vMax, "km/h")}</b>${leit}`,
          `🎯 <b>Faixa Beaufort:</b> ${nvVento >= 3 ? "≥ 89 km/h (Tempestade)" : nvVento === 2 ? "62 a 88 km/h (Ventania)" : "39 a 61 km/h (Vento Forte)"}`,
          `🛟 <b>Orientação DC:</b> ${acaoVento}`
        ].join("\n")
      });
    }

    // 4. Umidade relativa (ar seco)
    const umid = ehNum(e.umidade) ? e.umidade : (ehNum(e.humidity_percent) ? e.humidity_percent : null);
    if (umid !== null && umid <= 30) {
      const nvUmid = umid < 12 ? 3 : umid < 20 ? 2 : 1;
      const rotU = nvUmid >= 3 ? "🔴 Emergência (Ar Muito Seco < 12%)" : nvUmid === 2 ? "🟠 Alerta (Ar Seco 12–20%)" : "🟡 Atenção (Ar Seco 20–30%)";
      alertas.push({
        tipo: "catavento",
        chave: `catavento:umidade:${id}`,
        estacaoId: id,
        estacaoNome: nome,
        parametro: "umidade",
        nivel: nvUmid,
        critico: nvUmid >= 2,
        titulo: `💧 <b>CATAVENTO-SURYA (${rotU}) — ${esc(nome)}</b>`,
        detalhe: [
          `📍 <b>Local:</b> ${esc(nome)} (${esc(regiao)})`,
          `📊 <b>Umidade relativa medida:</b> <b>${Math.round(umid)}%</b>${ehNum(e.temperatura) ? ` · Temp: ${fmt1(e.temperatura, "°C")}` : ""}${leit}`,
          `🎯 <b>Critério OMS/INMET:</b> ${nvUmid >= 3 ? "Estado de Emergência (< 12%)" : nvUmid === 2 ? "Estado de Alerta (12% a 20%)" : "Estado de Atenção (20% a 30%)"}`,
          `🛟 <b>Orientação DC:</b> Risco elevado de incêndios em vegetação. Reforçar orientação de hidratação e proibição de queimadas.`
        ].join("\n")
      });
    }

    // 5. Temperatura extrema (calor ou frio)
    const temp = ehNum(e.temperatura) ? e.temperatura : (ehNum(e.temperature_c) ? e.temperature_c : null);
    if (temp !== null && (temp >= 30 || temp < 15)) {
      const nvTemp = temp >= 36 || temp <= 10 ? 2 : 1;
      const rotT = temp >= 36 ? "🟠 Calor Intenso (≥ 36 °C)" : temp >= 30 ? "🟡 Calor (30–36 °C)" : temp <= 10 ? "🥶 Frio Intenso (≤ 10 °C)" : "🌡️ Frio (< 15 °C)";
      const orientTemp = temp >= 30
        ? `Calor ${temp >= 36 ? "intenso" : "elevado"} registrado na estação (${fmt1(temp, "°C")}). Atenção à hidratação, insolação e risco de queimadas à tarde.`
        : `Queda acentuada de temperatura (${fmt1(temp, "°C")}). Atenção ao protocolo de proteção a pessoas vulneráveis.`;
      alertas.push({
        tipo: "catavento",
        chave: `catavento:temp:${id}`,
        estacaoId: id,
        estacaoNome: nome,
        parametro: "temp",
        nivel: nvTemp,
        critico: nvTemp >= 2,
        titulo: `🌡️ <b>CATAVENTO-SURYA (${rotT}) — ${esc(nome)}</b>`,
        detalhe: [
          `📍 <b>Local:</b> ${esc(nome)} (${esc(regiao)})`,
          `📊 <b>Temperatura medida:</b> <b>${fmt1(temp, "°C")}</b>${umid !== null ? ` · Umidade: ${Math.round(umid)}%` : ""}${leit}`,
          `🛟 <b>Orientação DC:</b> ${orientTemp}`
        ].join("\n")
      });
    }
  }
  return alertas;
}

export function avaliarGatilhosAlerta({ avisosInmet = [], cemaden = null, catavento = null, cotasRio = null, focosRecentes = [], nivelMinimo = 2 } = {}) {
  const alertas = [];

  for (const a of avisosInmet) {
    if (!a) continue;
    const nivel = nivelDaSeveridade(a.severidade);
    if (nivel < nivelMinimo) continue;
    const emoji = nivel >= 3 ? "🔴" : nivel === 2 ? "🟠" : "🟡";
    alertas.push({
      tipo: "inmet", chave: "inmet:" + (a.id || (a.evento + "|" + a.inicio + "|" + a.fim)), nivel, critico: nivel >= 2,
      titulo: `${emoji} <b>AVISO INMET (${esc(a.severidade || "Ativo")}): ${esc(a.evento || "Meteorológico")}</b>`,
      detalhe: `Vigência: ${esc(a.inicio || "—")} até ${esc(a.fim || "—")}${a.risco ? " · " + esc(a.risco) : ""}`
    });
  }

  const estacoes = cemaden && Array.isArray(cemaden.estacoes) ? cemaden.estacoes : [];
  for (const e of estacoes) {
    if (Number(e.ibge) !== IBGE_CAJAMAR) continue;
    const h1 = e.acc && typeof e.acc.h1 === "number" ? e.acc.h1 : null;
    const h24 = e.acc && typeof e.acc.h24 === "number" ? e.acc.h24 : null;
    const n1 = h1 === null || h1 < 20 ? 0 : h1 >= 60 ? 3 : h1 >= 40 ? 2 : 1;
    const n24 = h24 === null || h24 < 50 ? 0 : h24 >= 150 ? 3 : h24 >= 100 ? 2 : 1;
    const nivel = Math.max(n1, n24);
    if (!nivel) continue;
    alertas.push({
      tipo: "cemaden", chave: "cemaden:" + (e.id || e.nome), nivel, critico: true,
      titulo: `🌧️ <b>CHUVA FORTE NO PLUVIÔMETRO CEMADEN — ${esc(e.nome)}</b>`,
      detalhe: `1h: ${h1 !== null ? fmt1(h1) : "—"} · 24h: ${h24 !== null ? fmt1(h24) : "—"} (Leitura: ${esc(e.leitura || "—")})`
    });
  }

  if (catavento) {
    alertas.push(...avaliarEstacoesCatavento(catavento, cotasRio));
  }

  const focosCajamar = Array.isArray(focosRecentes)
    ? focosRecentes.filter((f) => f && f.emCajamar !== false)
    : [];
  if (focosCajamar.length > 0) {
    const nivelFogo = focosCajamar.length >= 3 ? 3 : 2;
    alertas.push({
      tipo: "fogo",
      chave: "fogo:cajamar",
      nivel: nivelFogo,
      qtd: focosCajamar.length,
      critico: true,
      titulo: `🔥 <b>FOCO(S) DE CALOR EM CAJAMAR (${focosCajamar.length} registro(s))</b>`,
      detalhe: focosCajamar.slice(0, 5).map((f) => {
        const sat = esc(f.rotuloSat || f.satelite || "INPE");
        const dh = f.dataHoraBrt ? ` às ${esc(f.dataHoraBrt)} BRT` : "";
        const frp = ehNum(f.frp) ? ` · FRP ${fmt1(f.frp, "MW")}` : "";
        return `Satélite ${sat}${dh} (${esc(f.lat)}, ${esc(f.lon)})${frp}`;
      }).join(" · ")
    });
  }
  return alertas;
}

// Compara o que está ativo agora com o que já foi avisado. Função pura: devolve o que enviar e o estado a gravar SE o envio der certo.
// estado = { alertas: { chave: { nivel, qtd, titulo, desde, ausencias } } }; fontesOk = { inmet, cemaden, catavento, fogo } (false = não deu para consultar).
// Verifica se chegou o momento de disparar o boletim periódico das estações (ex.: de 3 em 3 horas ou em horários fixos do dia)
export function deveEnviarBoletimPeriodico(estado, agoraMs = Date.now(), { intervaloMin = 0, horariosFixos = "" } = {}) {
  const ultIso = estado && estado.ultimoBoletimPeriodicoEm;
  const ultMs = ultIso ? Date.parse(ultIso) : NaN;
  const decorridoMs = Number.isNaN(ultMs) ? Infinity : (agoraMs - ultMs);

  // 1) Verifica horários fixos do dia em BRT (ex.: "06:00, 09:00, 12:00, 15:00, 18:00, 21:00")
  const listaH = String(horariosFixos || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(s));
  if (listaH.length > 0 && decorridoMs >= 45 * 60000) {
    const dBrt = new Date(agoraMs - 3 * 3600000);
    const minDiaAtual = dBrt.getUTCHours() * 60 + dBrt.getUTCMinutes();
    for (const hStr of listaH) {
      const [hh, mm] = hStr.split(":").map(Number);
      const alvoMin = hh * 60 + mm;
      const diff = minDiaAtual - alvoMin;
      if (diff >= 0 && diff <= 14) return true;
    }
  }

  // 2) Verifica intervalo periódico em minutos (ex.: 180 min = 3 em 3 horas; tolerância de 3 min para jitter do cron)
  const min = Number(intervaloMin);
  if (Number.isFinite(min) && min >= 10) {
    const limiarMs = Math.max(10, min - 3) * 60000;
    if (decorridoMs >= limiarMs) return true;
  }
  return false;
}

export function decidirEnvio(estado, alertas, { agoraMs = Date.now(), fontesOk = {}, intervaloBoletimMin = 0, horariosFixos = "" } = {}) {
  const antigo = (estado && estado.alertas) || {};
  const novo = {}, novos = [], agravados = [], encerrados = [];
  const ativos = {};
  for (const a of alertas) ativos[a.chave] = a;

  for (const a of alertas) {
    const ant = antigo[a.chave];
    if (!ant) {
      novos.push(a);
    } else if (
      a.nivel > ant.nivel ||
      (a.tipo === "catavento" && a.nivel !== ant.nivel) ||
      (a.tipo === "fogo" && ehNum(a.qtd) && ehNum(ant.qtd) && a.qtd > ant.qtd)
    ) {
      agravados.push(a);
    }
    const nivelGuardado = a.tipo === "catavento"
      ? a.nivel
      : (ant ? Math.max(ant.nivel, a.nivel) : a.nivel);
    const qtdGuardada = ehNum(a.qtd) ? (ant && ehNum(ant.qtd) ? Math.max(ant.qtd, a.qtd) : a.qtd) : undefined;
    novo[a.chave] = {
      nivel: nivelGuardado,
      ...(qtdGuardada !== undefined ? { qtd: qtdGuardada } : {}),
      titulo: a.titulo,
      detalhe: a.detalhe || (ant && ant.detalhe) || "",
      desde: ant ? ant.desde : new Date(agoraMs).toISOString(),
      ausencias: 0
    };
  }
  for (const chave of Object.keys(antigo)) {
    if (ativos[chave]) continue;
    const tipo = chave.split(":")[0];
    if (fontesOk[tipo] === false) { novo[chave] = antigo[chave]; continue; }          // fonte fora do ar: mantém como estava
    const ausencias = (antigo[chave].ausencias || 0) + 1;
    if (ausencias >= AUSENCIAS_PARA_ENCERRAR) {
      encerrados.push({
        chave,
        titulo: antigo[chave].titulo,
        detalheAnterior: antigo[chave].detalhe || "",
        desde: antigo[chave].desde
      });
    } else {
      novo[chave] = { ...antigo[chave], ausencias };
    }
  }
  const temMudanca = novos.length + agravados.length + encerrados.length > 0;
  const boletimPeriodico = !temMudanca && deveEnviarBoletimPeriodico(estado, agoraMs, { intervaloMin: intervaloBoletimMin, horariosFixos });
  const temMensagem = temMudanca || boletimPeriodico;
  const ultimoBoletimPeriodicoEm = temMensagem
    ? new Date(agoraMs).toISOString()
    : (estado && estado.ultimoBoletimPeriodicoEm ? estado.ultimoBoletimPeriodicoEm : undefined);
  return {
    novos,
    agravados,
    encerrados,
    boletimPeriodico,
    intervaloBoletimMin,
    estadoNovo: {
      alertas: novo,
      ...(ultimoBoletimPeriodicoEm ? { ultimoBoletimPeriodicoEm } : {}),
      atualizadoEm: new Date(agoraMs).toISOString()
    },
    temMensagem
  };
}

function encontrarEstacaoPorChave(chave, catavento) {
  if (!chave || !catavento) return null;
  const partes = String(chave).split(":");
  const idAlvo = partes.slice(2).join(":");
  if (!idAlvo) return null;
  const lista = Array.isArray(catavento.estacoes) ? catavento.estacoes : (Array.isArray(catavento) ? catavento : []);
  return lista.find((e) => e && (String(e.id || e.sn || e.nome).trim() === idAlvo || String(e.nome || "").toLowerCase().replace(/[^a-z0-9]+/g, "_") === idAlvo)) || null;
}

export function formatarMensagemTelegram(alertas, dataHoraBrt, extra = {}) {
  const novos = Array.isArray(alertas) ? alertas : [];
  const agravados = extra.agravados || [], encerrados = extra.encerrados || [];
  const ehPeriodico = Boolean(extra.boletimPeriodico);
  if (!novos.length && !agravados.length && !encerrados.length && !ehPeriodico) return null;

  const soEncerrados = !novos.length && !agravados.length && encerrados.length > 0;
  const soPeriodico = !novos.length && !agravados.length && !encerrados.length && ehPeriodico;
  const intMin = Number(extra.intervaloBoletimMin) || INTERVALO_PADRAO_BOLETIM_MIN;
  const rotIntervalo = intMin % 60 === 0 ? (intMin / 60) + " em " + (intMin / 60) + " horas" : intMin + " minutos";

  const partesRes = [];
  if (novos.length) partesRes.push(novos.length + " novo(s)");
  if (agravados.length) partesRes.push(agravados.length + " atualização(ões)");
  if (encerrados.length) partesRes.push(encerrados.length + " normalizado(s)");
  const subtituloTipo = soPeriodico
    ? `⏱️ <b>BOLETIM PERIÓDICO DAS ESTAÇÕES (A cada ${esc(rotIntervalo)})</b>`
    : soEncerrados
    ? "✅ <b>SITUAÇÃO NORMALIZADA (" + encerrados.length + " alerta(s) encerrado(s))</b>"
    : "📌 <b>Resumo:</b> " + partesRes.join(" · ");

  const linhas = [
    `🚨 <b>ALERTA AUTOMÁTICO — DEFESA CIVIL DE CAJAMAR</b>`,
    subtituloTipo,
    `🕒 <b>Verificação:</b> ${esc(dataHoraBrt)} (BRT)`,
    `━━━━━━━━━━━━━━━━━━━━`
  ];

  let itens = 0;
  const cabo = () => itens >= MAX_ITENS_MENSAGEM;

  for (const a of novos) {
    if (cabo()) break;
    linhas.push("🆕 " + a.titulo, a.detalhe, "");
    itens++;
  }
  for (const a of agravados) {
    if (cabo()) break;
    linhas.push("⬆️ <b>ATUALIZAÇÃO / MUDANÇA DE FAIXA</b>\n" + a.titulo, a.detalhe, "");
    itens++;
  }
  for (const e of encerrados) {
    if (cabo()) break;
    const titLimpo = String(e.titulo || "").replace(/^[^<]*/, "");
    const linhasEnc = ["✅ <b>ENCERRADO / NORMALIZADO:</b> " + titLimpo];
    const estAtual = encontrarEstacaoPorChave(e.chave, extra.catavento);
    if (estAtual) {
      const medAtual = resumirMedicoesEstacao(estAtual);
      if (medAtual) linhasEnc.push(`📉 <b>Leitura atual na estação:</b> ${medAtual} (retornou à faixa de normalidade)`);
    } else {
      linhasEnc.push(`📉 <b>Status atual:</b> Condição abaixo do limiar de alerta nas últimas 3 verificações (~30 min).`);
    }
    const desdeTxt = formatarIsoParaBrtCurto(e.desde);
    if (desdeTxt) linhasEnc.push(`🕓 <b>Estava ativo desde:</b> ${esc(desdeTxt)} (BRT)`);
    linhas.push(linhasEnc.join("\n"), "");
    itens++;
  }

  const total = novos.length + agravados.length + encerrados.length;
  if (total > itens) linhas.push(`… e mais ${total - itens} alerta(s). Veja o painel.`, "");
  if (soPeriodico) {
    const ativosAtuais = Array.isArray(extra.alertasAtivos) ? extra.alertasAtivos : [];
    if (ativosAtuais.length > 0) {
      linhas.push(`⚠️ <b>Alertas que permanecem ativos (${ativosAtuais.length}):</b>`);
      for (const at of ativosAtuais.slice(0, 5)) {
        linhas.push("• " + at.titulo);
      }
      linhas.push("");
    } else {
      linhas.push("🟢 <b>Status de Risco:</b> Nenhuma estação municipal acima dos limiares críticos neste momento.", "");
    }
  }
  if (soPeriodico) {
    const ativosAtuais = Array.isArray(extra.alertasAtivos) ? extra.alertasAtivos : [];
    if (ativosAtuais.length > 0) {
      linhas.push(`⚠️ <b>Alertas que permanecem ativos (${ativosAtuais.length}):</b>`);
      for (const at of ativosAtuais.slice(0, 5)) {
        linhas.push("• " + at.titulo);
      }
      linhas.push("");
    } else {
      linhas.push("🟢 <b>Status de Risco:</b> Nenhuma estação municipal acima dos limiares críticos neste momento.", "");
    }
  }

  // Se houver dados atuais das estações de Cajamar (extra.catavento), inclui o panorama rápido das estações da cidade
  const listaEst = extra.catavento && Array.isArray(extra.catavento.estacoes)
    ? extra.catavento.estacoes
    : (Array.isArray(extra.catavento) ? extra.catavento : []);
  if (listaEst.length > 0) {
    let refPanMs = extra.catavento && extra.catavento.coletadoEm ? Date.parse(extra.catavento.coletadoEm) : NaN;
    for (const item of listaEst) {
      const tI = item && item.leitura ? msLeituraEstacao(item.leitura) : NaN;
      if (!Number.isNaN(tI) && (Number.isNaN(refPanMs) || tI > refPanMs)) refPanMs = tI;
    }
    const online = [], offline = [];
    for (const est of listaEst) {
      if (!Number.isNaN(refPanMs) && estacaoEstaOffline(est, refPanMs)) offline.push(est);
      else online.push(est);
    }
    linhas.push(`━━━━━━━━━━━━━━━━━━━━`, `📊 <b>PANORAMA AO VIVO — ESTAÇÕES DE CAJAMAR:</b>`);
    for (const est of online) {
      const resumoEst = resumirMedicoesEstacao(est, refPanMs);
      if (resumoEst) linhas.push(`• <b>${esc(est.nome || est.id)}:</b> ${resumoEst}`);
    }
    for (const est of offline) {
      const leitOff = formatarIsoParaBrtCurto(est.leitura);
      linhas.push(`• <b>${esc(est.nome || est.id)}:</b> ⚠️ <i>Sem conexão (último dado em ${esc(leitOff || est.leitura)})</i>`);
    }
    linhas.push("");
  }

  linhas.push(`🔗 <b>Painel ao vivo:</b> https://theolindolfo02.github.io/cajamar-ao-vivo/`);
  return linhas.join("\n");
}

export async function enviarTelegram(botToken, chatId, texto, buscar = fetch) {
  const r = await buscar(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: "HTML", disable_web_page_preview: true })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.description || `Telegram HTTP ${r.status}`);
  return j;
}

// ---- Coleta e filtragem de Focos de Calor (INPE BDQueimadas) no território de Cajamar ----
function distanciaKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function converterDataGmt(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(s || "").trim());
  if (!m) return { ts: null, brt: "—" };
  const ts = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  const dBrt = new Date(ts - 3 * 3600000);
  const p2 = (n) => String(n).padStart(2, "0");
  return { ts, brt: `${p2(dBrt.getUTCDate())}/${p2(dBrt.getUTCMonth() + 1)} ${p2(dBrt.getUTCHours())}:${p2(dBrt.getUTCMinutes())}` };
}

export function lerCsvFocosCajamar(texto, agoraMs = Date.now(), janelaMs = JANELA_FOGO_MS) {
  const linhas = String(texto || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (linhas.length < 2) return [];
  const cab = linhas[0].split(",").map((c) => c.trim().toLowerCase());
  const idx = {};
  cab.forEach((c, i) => { idx[c] = i; });
  if (idx.lat === undefined || idx.lon === undefined || idx.satelite === undefined) return [];
  const out = [];
  for (let i = 1; i < linhas.length; i++) {
    const c = linhas[i].split(",");
    const lat = parseFloat(c[idx.lat]), lon = parseFloat(c[idx.lon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const dist = distanciaKm(LAT_CAJAMAR, LON_CAJAMAR, lat, lon);
    const mun = idx.municipio !== undefined && c[idx.municipio] ? c[idx.municipio].trim() : "";
    const munId = idx.municipio_id !== undefined && c[idx.municipio_id] ? Number(c[idx.municipio_id]) : null;
    // Se o CSV traz município (arquivo diário), exige Cajamar; se não traz (arquivo 10 min), usa raio territorial de Cajamar (<= 8 km)
    const temColunaMun = idx.municipio !== undefined || idx.municipio_id !== undefined;
    const emCajamar = temColunaMun
      ? (munId === IBGE_CAJAMAR || /^CAJAMAR$/i.test(mun))
      : (dist <= 8);
    if (!emCajamar) continue;
    const dhBruto = idx.data_hora_gmt !== undefined ? c[idx.data_hora_gmt] : (idx.data !== undefined ? c[idx.data] : "");
    const dt = converterDataGmt(dhBruto);
    if (dt.ts !== null && (dt.ts < agoraMs - janelaMs || dt.ts > agoraMs + 600000)) continue;
    const sat = c[idx.satelite] ? c[idx.satelite].trim() : "INPE";
    const frp = idx.frp !== undefined && c[idx.frp] !== "" ? parseFloat(c[idx.frp]) : null;
    out.push({
      id: `${sat}:${lat.toFixed(3)}:${lon.toFixed(3)}:${dt.brt.slice(0, 11)}`,
      lat: Math.round(lat * 10000) / 10000,
      lon: Math.round(lon * 10000) / 10000,
      ts: dt.ts,
      dataHoraBrt: dt.brt,
      satelite: sat,
      municipio: mun || "Cajamar",
      emCajamar: true,
      distanciaKm: Math.round(dist * 10) / 10,
      frp: Number.isFinite(frp) ? frp : null
    });
  }
  return out;
}

export async function consultarFocosInpe(agoraMs = Date.now(), { buscar = fetch, timeoutMs = 12000 } = {}) {
  async function buscarTxt(url) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await buscar(url, { signal: ctl.signal, headers: { "User-Agent": USER_AGENT } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.text();
    } finally { clearTimeout(t); }
  }

  let lidos = 0;
  const todos = [];
  // 1) Últimos arquivos de 10 min
  try {
    const html10 = await buscarTxt(URL_INPE_10MIN);
    const arqs10 = [...html10.matchAll(/href="([^"]*focos_10min_[^"]+\.csv)"/g)].map((m) => m[1]).slice(-3);
    for (const nome of arqs10) {
      try {
        const u = nome.startsWith("http") ? nome : URL_INPE_10MIN + nome;
        todos.push(...lerCsvFocosCajamar(await buscarTxt(u), agoraMs));
        lidos++;
      } catch (e) { /* tenta próximo arquivo */ }
    }
  } catch (e) { /* segue para diários */ }

  // 2) Últimos arquivos diários do Brasil
  const fmtDiaUtc = (ms) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  };
  let arqsDiarios = [`focos_diario_br_${fmtDiaUtc(agoraMs)}.csv`, `focos_diario_br_${fmtDiaUtc(agoraMs - 86400000)}.csv`];
  try {
    const htmlD = await buscarTxt(URL_INPE_DIARIO);
    const achados = [...htmlD.matchAll(/href="([^"]*focos_diario_br_\d{8}\.csv)"/g)].map((m) => m[1]).slice(-2);
    if (achados.length) arqsDiarios = achados;
  } catch (e) { /* usa nomes padrão das últimas 48h */ }

  for (const nome of arqsDiarios) {
    try {
      const u = nome.startsWith("http") ? nome : URL_INPE_DIARIO + nome;
      todos.push(...lerCsvFocosCajamar(await buscarTxt(u), agoraMs));
      lidos++;
    } catch (e) { /* ignora falha individual */ }
  }

  if (!lidos) return { ok: false, focos: [] };
  const vistos = new Set();
  const focos = [];
  for (const f of todos) {
    if (vistos.has(f.id)) continue;
    vistos.add(f.id);
    focos.push(f);
  }
  return { ok: true, focos };
}

export async function consultarCataventoAoVivo(agoraMs = Date.now(), { buscar = fetch, url = process.env.CATAVENTO_URL || "", timeoutMs = 12000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  const urls = url ? [url] : [URL_CATAVENTO_API_UNIFIED, URL_CATAVENTO_API_UNIFIED_ALT, URL_CATAVENTO];
  try {
    for (const u of urls) {
      try {
        const r = await buscar(u, { signal: ctl.signal, headers: { "User-Agent": USER_AGENT } });
        if (!r.ok) continue;
        const estacoes = lerCatavento(await r.text());
        if (estacoes.length > 0) return { ok: true, coletadoEm: new Date(agoraMs).toISOString(), estacoes };
      } catch (e) { /* tenta próxima URL */ }
    }
    return { ok: false, estacoes: [] };
  } finally {
    clearTimeout(t);
  }
}

async function lerJson(caminho) { try { return JSON.parse(await readFile(caminho, "utf8")); } catch (e) { return null; } }

async function gravarEstado(caminho, estado) {
  await mkdir(dirname(caminho), { recursive: true });
  const tmp = caminho + ".tmp";
  await writeFile(tmp, JSON.stringify(estado, null, 1));
  await rename(tmp, caminho);
}

async function consultarInmet(agoraMs) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15000);
    const r = await fetch("https://apiprevmet3.inmet.gov.br/avisos/ativos", { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return { ok: false, avisos: [] };
    return normalizarAvisosInmet(await r.json(), agoraMs);
  } catch (e) { return { ok: false, avisos: [] }; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const agoraMs = Date.now();
  const caminhoCemaden = process.argv[2] || "data/cemaden.json";
  const caminhoEstado = process.argv[3] || "data/alertas-estado.json";
  const caminhoCatavento = process.argv[4] || "data/catavento.json";
  const nivelMinimo = Number(process.env.ALERTAS_NIVEL_MINIMO) || 2;

  const cemaden = await lerJson(caminhoCemaden);
  const cemadenOk = !!(cemaden && Array.isArray(cemaden.estacoes) && agoraMs - Date.parse(cemaden.coletadoEm) <= IDADE_MAX_CEMADEN_MS);

  let catavento = await lerJson(caminhoCatavento);
  let cataventoOk = !!(catavento && Array.isArray(catavento.estacoes) && catavento.estacoes.length > 0 && agoraMs - Date.parse(catavento.coletadoEm) <= IDADE_MAX_CEMADEN_MS);
  if (!cataventoOk) {
    const aoVivo = await consultarCataventoAoVivo(agoraMs);
    if (aoVivo.ok) {
      catavento = aoVivo;
      cataventoOk = true;
    }
  }

  const [inmet, fogo] = await Promise.all([
    consultarInmet(agoraMs),
    consultarFocosInpe(agoraMs)
  ]);

  const fontesOk = { inmet: inmet.ok, cemaden: cemadenOk, catavento: cataventoOk, fogo: fogo.ok };
  const alertas = avaliarGatilhosAlerta({
    avisosInmet: inmet.avisos,
    cemaden: cemadenOk ? cemaden : null,
    catavento: cataventoOk ? catavento : null,
    focosRecentes: fogo.ok ? fogo.focos : [],
    nivelMinimo
  });
  // Lê o intervalo personalizado configurado no painel ("Dados e fontes" -> Cloudflare Worker /config-alertas), padrão 180 min (3 em 3 horas)
  let intervaloBoletimMin = process.env.ALERTAS_INTERVALO_MIN !== undefined ? Number(process.env.ALERTAS_INTERVALO_MIN) : INTERVALO_PADRAO_BOLETIM_MIN;
  let horariosFixos = process.env.ALERTAS_HORARIOS_FIXOS || "";
  let ultimoBoletimWorker = null;
  const urlCfg = (process.env.WORKER_CONFIG_URL || "https://cajamar-cemaden.theolindolfo02.workers.dev/config-alertas");
  try {
    const ctlCfg = new AbortController();
    const tCfg = setTimeout(() => ctlCfg.abort(), 6000);
    const rCfg = await fetch(urlCfg, { signal: ctlCfg.signal, headers: { "User-Agent": USER_AGENT } });
    clearTimeout(tCfg);
    if (rCfg.ok) {
      const jCfg = await rCfg.json();
      if (jCfg && jCfg.config) {
        if (typeof jCfg.config.intervaloMinutos === "number") intervaloBoletimMin = jCfg.config.intervaloMinutos;
        if (typeof jCfg.config.horariosFixos === "string") horariosFixos = jCfg.config.horariosFixos;
        if (jCfg.config.ultimoBoletimEm) ultimoBoletimWorker = jCfg.config.ultimoBoletimEm;
      }
    }
  } catch (e) { /* usa padrão de 180 min (3 em 3 horas) */ }

  const estado = (await lerJson(caminhoEstado)) || { alertas: {} };
  if (ultimoBoletimWorker) {
    const tLoc = estado.ultimoBoletimPeriodicoEm ? Date.parse(estado.ultimoBoletimPeriodicoEm) : 0;
    const tRem = Date.parse(ultimoBoletimWorker) || 0;
    if (tRem > tLoc) estado.ultimoBoletimPeriodicoEm = ultimoBoletimWorker;
  }
  const dec = decidirEnvio(estado, alertas, {
    agoraMs,
    fontesOk,
    intervaloBoletimMin: cataventoOk ? intervaloBoletimMin : 0,
    horariosFixos: cataventoOk ? horariosFixos : ""
  });
  const agoraBrt = new Date(agoraMs).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  console.log(`[alertas-telegram] ${agoraBrt}: fontes INMET=${inmet.ok ? "ok" : "FALHOU"} CEMADEN=${cemadenOk ? "ok" : "indisponível/antigo"} CATAVENTO=${cataventoOk ? "ok" : "indisponível"} FOGO_INPE=${fogo.ok ? `ok (${fogo.focos.length} foco(s) em Cajamar)` : "FALHOU"}; intervalo=${intervaloBoletimMin}min; ativos=${alertas.length}; novos=${dec.novos.length}; agravados=${dec.agravados.length}; encerrados=${dec.encerrados.length}; periodico=${dec.boletimPeriodico}`);

  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim(), chat = (process.env.TELEGRAM_CHAT_ID || "").trim();
  const msg = formatarMensagemTelegram(dec.novos, agoraBrt, {
    agravados: dec.agravados,
    encerrados: dec.encerrados,
    boletimPeriodico: dec.boletimPeriodico,
    intervaloBoletimMin,
    alertasAtivos: alertas,
    catavento: cataventoOk ? catavento : null
  });
  if (!token || !chat) {
    console.log("[alertas-telegram] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID não configurados: nada enviado e nada gravado." + (msg ? "\nMensagem que seria enviada:\n" + msg : " Nenhuma mensagem pendente."));
    process.exit(0);
  }
  if (!dec.temMensagem) {
    await gravarEstado(caminhoEstado, dec.estadoNovo);
    console.log("[alertas-telegram] Nada novo para avisar neste ciclo.");
    process.exit(0);
  }
  try {
    await enviarTelegram(token, chat, msg);
    await gravarEstado(caminhoEstado, dec.estadoNovo);
    try {
      await fetch(urlCfg, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
        body: JSON.stringify({ marcarEnvio: true, ultimoBoletimEm: dec.estadoNovo.ultimoBoletimPeriodicoEm })
      });
    } catch (eSync) { /* não interrompe se o Worker oscilar */ }
    console.log("[alertas-telegram] Mensagem enviada ao Telegram e estado gravado.");
  } catch (e) {
    console.log(`::warning::Falha ao enviar ao Telegram (${e.message}). O estado não foi gravado: tentará de novo no próximo ciclo.`);
    process.exitCode = 1;
  }
}
