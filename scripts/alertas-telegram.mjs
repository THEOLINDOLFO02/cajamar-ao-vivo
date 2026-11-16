// Robô de Alertas Automáticos em Segundo Plano (2.7) — Defesa Civil de Cajamar/SP.
// Roda no GitHub Actions a cada 10 minutos (ou pela linha de comando) e verifica:
// 1. Avisos ativos do INMET para Cajamar (IBGE 3509205), a partir de ALERTAS_NIVEL_MINIMO (padrão 2 = "Perigo"; 1 = inclui "Perigo Potencial");
// 2. Pluviômetros do CEMADEN em Cajamar com acumulado >= 20 mm/1h ou >= 50 mm/24h;
// 3. Focos de calor em Cajamar (ainda não ligado: a lista chega vazia).
//
// SEM REPETIÇÃO: o robô guarda o que já avisou (data/alertas-estado.json, restaurado pelo cache do GitHub Actions).
// Só manda mensagem quando o alerta é NOVO ou AGRAVOU (nível maior), e avisa quando ENCERROU. Se uma fonte falhar
// (INMET fora do ar, arquivo do CEMADEN velho), os alertas dela ficam como estão: falha de consulta não vira "encerrado".
// Sem TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID (Secrets do repositório) nada é enviado nem gravado: só aparece no log.
// Se o Telegram recusar a mensagem, o estado NÃO é gravado (tenta de novo no próximo ciclo) e o passo avisa no log.

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const IBGE_CAJAMAR = 3509205;
export const AUSENCIAS_PARA_ENCERRAR = 3;   // 3 ciclos seguidos sem o alerta (~30 min) antes de dizer "encerrado"
export const IDADE_MAX_CEMADEN_MS = 3 * 3600 * 1000;
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

const fmt1 = (v) => v.toFixed(1).replace(".", ",") + " mm";

export function avaliarGatilhosAlerta({ avisosInmet = [], cemaden = null, focosRecentes = [], nivelMinimo = 2 } = {}) {
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

  if (Array.isArray(focosRecentes) && focosRecentes.length > 0) {
    alertas.push({
      tipo: "fogo", chave: "fogo:cajamar", nivel: 2, critico: true,
      titulo: `🔥 <b>FOCO(S) DE CALOR EM CAJAMAR (${focosRecentes.length} registro(s))</b>`,
      detalhe: focosRecentes.slice(0, 5).map((f) => `Satélite ${esc(f.satelite || "INPE")} (${esc(f.lat)}, ${esc(f.lon)})`).join(" · ")
    });
  }
  return alertas;
}

// Compara o que está ativo agora com o que já foi avisado. Função pura: devolve o que enviar e o estado a gravar SE o envio der certo.
// estado = { alertas: { chave: { nivel, titulo, desde, ausencias } } }; fontesOk = { inmet, cemaden, fogo } (false = não deu para consultar).
export function decidirEnvio(estado, alertas, { agoraMs = Date.now(), fontesOk = {} } = {}) {
  const antigo = (estado && estado.alertas) || {};
  const novo = {}, novos = [], agravados = [], encerrados = [];
  const ativos = {};
  for (const a of alertas) ativos[a.chave] = a;

  for (const a of alertas) {
    const ant = antigo[a.chave];
    if (!ant) novos.push(a);
    else if (a.nivel > ant.nivel) agravados.push(a);
    const nivelGuardado = ant ? Math.max(ant.nivel, a.nivel) : a.nivel;   // não "esquece" o nível máximo já avisado enquanto durar
    novo[a.chave] = { nivel: nivelGuardado, titulo: a.titulo, desde: ant ? ant.desde : new Date(agoraMs).toISOString(), ausencias: 0 };
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
  for (const a of agravados) { if (cabo()) break; linhas.push("⬆️ <b>AGRAVOU</b> " + a.titulo, a.detalhe, ""); itens++; }
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
  const caminhoCemaden = process.argv[2] || "data/cemaden.json", caminhoEstado = process.argv[3] || "data/alertas-estado.json";
  const nivelMinimo = Number(process.env.ALERTAS_NIVEL_MINIMO) || 2;
  const cemaden = await lerJson(caminhoCemaden);
  const cemadenOk = !!(cemaden && Array.isArray(cemaden.estacoes) && agoraMs - Date.parse(cemaden.coletadoEm) <= IDADE_MAX_CEMADEN_MS);
  const inmet = await consultarInmet(agoraMs);
  const fontesOk = { inmet: inmet.ok, cemaden: cemadenOk, fogo: false };
  const alertas = avaliarGatilhosAlerta({ avisosInmet: inmet.avisos, cemaden: cemadenOk ? cemaden : null, focosRecentes: [], nivelMinimo });
  const estado = (await lerJson(caminhoEstado)) || { alertas: {} };
  const dec = decidirEnvio(estado, alertas, { agoraMs, fontesOk });
  const agoraBrt = new Date(agoraMs).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  console.log(`[alertas-telegram] ${agoraBrt}: fontes INMET=${inmet.ok ? "ok" : "FALHOU"} CEMADEN=${cemadenOk ? "ok" : "indisponível/antigo"}; ativos=${alertas.length}; novos=${dec.novos.length}; agravados=${dec.agravados.length}; encerrados=${dec.encerrados.length}`);

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
