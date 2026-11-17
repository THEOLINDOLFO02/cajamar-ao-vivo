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

  for (const e of lista) {
    if (!e || typeof e !== "object") continue;
    const id = String(e.id || e.sn || e.nome || "est").trim();
    const nome = String(e.nome || e.alias || id).trim();
    const leit = e.leitura ? ` (Leitura: ${esc(e.leitura)})` : "";

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
      if (h1 !== null) partes.push(`1h: ${fmt1(h1)}`);
      if (h24 !== null) partes.push(`24h: ${fmt1(h24)}`);
      if (h72 !== null) partes.push(`72h: ${fmt1(h72)}`);
      if (h168 !== null) partes.push(`7d: ${fmt1(h168)}`);
      alertas.push({
        tipo: "catavento",
        chave: `catavento:chuva:${id}`,
        nivel: nvChuva,
        critico: nvChuva >= 2,
        titulo: `🌧️ <b>CATAVENTO-SURYA (CHUVA — ${rot}) — ${esc(nome)}</b>`,
        detalhe: `${partes.join(" · ")}${leit}`
      });
    }

    // 2. Nível do Rio (Réguas)
    const nvRio = ehNum(e.nivelRio) ? e.nivelRio : (ehNum(e.water_level_m) ? e.water_level_m : null);
    const deltaCm = ehNum(e.variacaoNivelM) ? Math.round(e.variacaoNivelM * 100) : null;
    const stRio = String(e.statusRio || e.status || "").toLowerCase();
    const nvStatus = (stRio === "critico" || stRio === "inundacao") ? 3 : stRio === "alerta" ? 2 : stRio === "atencao" ? 1 : 0;
    if (nvRio !== null || nvStatus > 0) {
      const nvDelta = deltaCm !== null ? (deltaCm >= dAlertaCm ? 2 : deltaCm >= dAtencaoCm ? 1 : 0) : 0;
      const nvCota = nvRio !== null ? (nvRio >= cTransb ? 3 : nvRio >= cAlerta ? 2 : nvRio >= cAtencao ? 1 : 0) : 0;
      // Se a tabela "Rios" do Catavento já trouxe status oficial ("normal" em Natura a 3,57 m, por exemplo) e cotasRio não foi customizado, respeita o status oficial + variação Δ
      const nvHid = (stRio && !cotasRio) ? Math.max(nvStatus, nvDelta) : Math.max(nvStatus, nvCota, nvDelta);
      if (nvHid > 0) {
        const rotH = nvHid >= 3 ? "🔴 Cota de Transbordamento" : nvHid === 2 ? "🟠 Alerta Hidrológico (Cheia)" : "🟡 Atenção Hidrológica";
        alertas.push({
          tipo: "catavento",
          chave: `catavento:nivel:${id}`,
          nivel: nvHid,
          critico: nvHid >= 2,
          titulo: `🌊 <b>CATAVENTO-SURYA (${rotH}) — ${esc(nome)}</b>`,
          detalhe: `${nvRio !== null ? `Nível: ${fmt2(nvRio)}` : `Status: ${esc(stRio)}`}${deltaCm !== null ? ` · Variação (Δ): +${deltaCm} cm` : ""}${leit}`
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
      alertas.push({
        tipo: "catavento",
        chave: `catavento:vento:${id}`,
        nivel: nvVento,
        critico: nvVento >= 2,
        titulo: `💨 <b>CATAVENTO-SURYA (${rotV}) — ${esc(nome)}</b>`,
        detalhe: `Velocidade/Rajada: ${fmt1(vMax, "km/h")}${leit}`
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
        nivel: nvUmid,
        critico: nvUmid >= 2,
        titulo: `💧 <b>CATAVENTO-SURYA (${rotU}) — ${esc(nome)}</b>`,
        detalhe: `Umidade relativa: ${Math.round(umid)}%${leit}`
      });
    }

    // 5. Temperatura extrema (calor ou frio)
    const temp = ehNum(e.temperatura) ? e.temperatura : (ehNum(e.temperature_c) ? e.temperature_c : null);
    if (temp !== null && (temp >= 30 || temp < 15)) {
      const nvTemp = temp >= 36 || temp <= 10 ? 2 : 1;
      const rotT = temp >= 36 ? "🟠 Calor Intenso (≥ 36 °C)" : temp >= 30 ? "🟡 Calor (30–36 °C)" : temp <= 10 ? "🥶 Frio Intenso (≤ 10 °C)" : "🌡️ Frio (< 15 °C)";
      alertas.push({
        tipo: "catavento",
        chave: `catavento:temp:${id}`,
        nivel: nvTemp,
        critico: nvTemp >= 2,
        titulo: `🌡️ <b>CATAVENTO-SURYA (${rotT}) — ${esc(nome)}</b>`,
        detalhe: `Temperatura: ${fmt1(temp, "°C")}${leit}`
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
export function decidirEnvio(estado, alertas, { agoraMs = Date.now(), fontesOk = {} } = {}) {
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
      desde: ant ? ant.desde : new Date(agoraMs).toISOString(),
      ausencias: 0
    };
  }
  for (const chave of Object.keys(antigo)) {
    if (ativos[chave]) continue;
    const tipo = chave.split(":")[0];
    if (fontesOk[tipo] === false) { novo[chave] = antigo[chave]; continue; }          // fonte fora do ar: mantém como estava
    const ausencias = (antigo[chave].ausencias || 0) + 1;
    if (ausencias >= AUSENCIAS_PARA_ENCERRAR) encerrados.push({ chave, titulo: antigo[chave].titulo, desde: antigo[chave].desde });
    else novo[chave] = { ...antigo[chave], ausencias };
  }
  return { novos, agravados, encerrados, estadoNovo: { alertas: novo, atualizadoEm: new Date(agoraMs).toISOString() }, temMensagem: novos.length + agravados.length + encerrados.length > 0 };
}

export function formatarMensagemTelegram(alertas, dataHoraBrt, extra = {}) {
  const novos = Array.isArray(alertas) ? alertas : [];
  const agravados = extra.agravados || [], encerrados = extra.encerrados || [];
  if (!novos.length && !agravados.length && !encerrados.length) return null;
  const linhas = [`🚨 <b>ALERTA AUTOMÁTICO — DEFESA CIVIL DE CAJAMAR</b>`, `🕒 <b>Verificação:</b> ${esc(dataHoraBrt)} (BRT)`, `━━━━━━━━━━━━━━━━━━━━`];
  let itens = 0;
  const cabo = () => itens >= MAX_ITENS_MENSAGEM;
  for (const a of novos) { if (cabo()) break; linhas.push(a.titulo, a.detalhe, ""); itens++; }
  for (const a of agravados) { if (cabo()) break; linhas.push("⬆️ <b>ATUALIZAÇÃO / AGRAVAMENTO</b> " + a.titulo, a.detalhe, ""); itens++; }
  for (const e of encerrados) { if (cabo()) break; linhas.push("✅ <b>ENCERRADO</b> " + String(e.titulo || "").replace(/^[^<]*/, ""), ""); itens++; }
  const total = novos.length + agravados.length + encerrados.length;
  if (total > itens) linhas.push(`… e mais ${total - itens} alerta(s). Veja o painel.`, "");
  linhas.push(`🔗 Painel ao vivo: https://theolindolfo02.github.io/cajamar-ao-vivo/`);
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
  const estado = (await lerJson(caminhoEstado)) || { alertas: {} };
  const dec = decidirEnvio(estado, alertas, { agoraMs, fontesOk });
  const agoraBrt = new Date(agoraMs).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  console.log(`[alertas-telegram] ${agoraBrt}: fontes INMET=${inmet.ok ? "ok" : "FALHOU"} CEMADEN=${cemadenOk ? "ok" : "indisponível/antigo"} CATAVENTO=${cataventoOk ? "ok" : "indisponível"} FOGO_INPE=${fogo.ok ? `ok (${fogo.focos.length} foco(s) em Cajamar)` : "FALHOU"}; ativos=${alertas.length}; novos=${dec.novos.length}; agravados=${dec.agravados.length}; encerrados=${dec.encerrados.length}`);

  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim(), chat = (process.env.TELEGRAM_CHAT_ID || "").trim();
  const msg = formatarMensagemTelegram(dec.novos, agoraBrt, { agravados: dec.agravados, encerrados: dec.encerrados });
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
    console.log("[alertas-telegram] Mensagem enviada ao Telegram e estado gravado.");
  } catch (e) {
    console.log(`::warning::Falha ao enviar ao Telegram (${e.message}). O estado não foi gravado: tentará de novo no próximo ciclo.`);
    process.exitCode = 1;
  }
}
