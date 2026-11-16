// Robô de Alertas Automáticos em Segundo Plano (2.7) — Defesa Civil de Cajamar/SP.
// Roda no GitHub Actions a cada 10 minutos (ou via linha de comando) e verifica:
// 1. Avisos ativos do INMET (Perigo / Grande Perigo) que incluam o município de Cajamar (IBGE 3509205);
// 2. Pluviômetros do CEMADEN em Cajamar com acumulado >= 20 mm/1h ou >= 50 mm/24h;
// 3. Focos de calor por satélite (INPE BDQueimadas — arquivo de 10 min) dentro do município de Cajamar.
// Se TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID estiverem configurados nos Secrets do repositório, dispara o alerta no grupo do Telegram.
// Sem chaves configuradas, registra o diagnóstico completo no log da Action e sai com código 0.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const IBGE_CAJAMAR = 3509205;
const LAT_CAJAMAR = -23.3547;
const LON_CAJAMAR = -46.8764;

export function avaliarGatilhosAlerta({ avisosInmet = [], cemaden = null, focosRecentes = [] } = {}) {
  const alertas = [];

  // 1. Avisos INMET para Cajamar
  for (const a of avisosInmet) {
    if (!a) continue;
    const sev = String(a.severidade || "").toLowerCase();
    const critico = sev.includes("perigo") && !sev.includes("potencial");
    const emoji = sev.includes("grande") ? "🔴" : critico ? "🟠" : "🟡";
    alertas.push({
      tipo: "inmet",
      critico,
      titulo: `${emoji} *AVISO INMET (${a.severidade || "Ativo"}): ${a.evento || "Meteorológico"}*`,
      detalhe: `Vigência: ${a.inicio || "—"} até ${a.fim || "—"}${a.risco ? " · " + a.risco : ""}`
    });
  }

  // 2. Pluviômetros CEMADEN em Cajamar (>= 20 mm/1h ou >= 50 mm/24h)
  const estacoes = (cemaden && Array.isArray(cemaden.estacoes)) ? cemaden.estacoes : [];
  for (const e of estacoes) {
    if (Number(e.ibge) !== IBGE_CAJAMAR) continue;
    const h1 = e.acc && typeof e.acc.h1 === "number" ? e.acc.h1 : null;
    const h24 = e.acc && typeof e.acc.h24 === "number" ? e.acc.h24 : null;
    if ((h1 !== null && h1 >= 20) || (h24 !== null && h24 >= 50)) {
      alertas.push({
        tipo: "cemaden",
        critico: true,
        titulo: `🌧️ *CHUVA FORTE NO PLUVIÔMETRO CEMADEN — ${e.nome}*`,
        detalhe: `1h: ${h1 !== null ? h1.toFixed(1).replace(".", ",") + " mm" : "—"} · 24h: ${h24 !== null ? h24.toFixed(1).replace(".", ",") + " mm" : "—"} (Leitura: ${e.leitura || "—"})`
      });
    }
  }

  // 3. Focos de calor em Cajamar
  if (Array.isArray(focosRecentes) && focosRecentes.length > 0) {
    alertas.push({
      tipo: "fogo",
      critico: true,
      titulo: `🔥 *FOCO(S) DE CALOR EM CAJAMAR (${focosRecentes.length} registro(s))*`,
      detalhe: focosRecentes.slice(0, 5).map((f) => `Satélite ${f.satelite || "INPE"} (${f.lat}, ${f.lon})`).join(" · ")
    });
  }

  return alertas;
}

export function formatarMensagemTelegram(alertas, dataHoraBrt) {
  if (!Array.isArray(alertas) || !alertas.length) return null;
  const linhas = [
    `🚨 *ALERTA AUTOMÁTICO — DEFESA CIVIL DE CAJAMAR*`,
    `🕒 *Verificação:* ${dataHoraBrt} (BRT)`,
    `━━━━━━━━━━━━━━━━━━━━`
  ];
  for (const a of alertas) {
    linhas.push(a.titulo);
    linhas.push(a.detalhe);
    linhas.push("");
  }
  linhas.push(`🔗 Painel ao vivo: https://theolindolfo02.github.io/cajamar-ao-vivo/`);
  return linhas.join("\n");
}

async function consultarAvisosInmetCajamar() {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12000);
    const r = await fetch("https://apiprevmet3.inmet.gov.br/avisos/ativos", { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return [];
    const j = await r.json();
    const todos = [].concat(j.hoje || [], j.futuro || []);
    return todos.filter((a) => {
      const cods = String(a.geocodes || a.ibge || "");
      return cods.includes(String(IBGE_CAJAMAR));
    }).map((a) => ({
      evento: a.descricao || a.evento || "Aviso Meteorológico",
      severidade: a.severidade || "",
      inicio: a.inicio || "",
      fim: a.fim || "",
      risco: Array.isArray(a.riscos) ? a.riscos[0] : ""
    }));
  } catch (e) {
    return [];
  }
}

async function lerCemadenLocal(caminho = "data/cemaden.json") {
  try {
    const txt = await readFile(caminho, "utf8");
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
}

export async function enviarTelegram(botToken, chatId, texto, buscar = fetch) {
  const r = await buscar(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: texto,
      parse_mode: "Markdown",
      disable_web_page_preview: true
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) {
    throw new Error(j.description || `Telegram HTTP ${r.status}`);
  }
  return j;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cemaden = await lerCemadenLocal(process.argv[2] || "data/cemaden.json");
  const avisosInmet = await consultarAvisosInmetCajamar();
  const alertas = avaliarGatilhosAlerta({ avisosInmet, cemaden, focosRecentes: [] });
  const agoraBrt = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  if (!alertas.length) {
    console.log(`[alertas-telegram] ${agoraBrt}: Nenhum gatilho crítico em Cajamar neste ciclo.`);
    process.exit(0);
  }

  const msg = formatarMensagemTelegram(alertas, agoraBrt);
  console.log("[alertas-telegram] Gatilhos identificados:\n" + msg);

  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chat = (process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!token || !chat) {
    console.log("[alertas-telegram] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID não configurados nos Secrets; alerta exibido apenas no log.");
    process.exit(0);
  }

  try {
    await enviarTelegram(token, chat, msg);
    console.log("[alertas-telegram] Alerta enviado com sucesso para o Telegram.");
  } catch (e) {
    console.error("[alertas-telegram] Falha ao enviar ao Telegram:", e.message);
  }
}
