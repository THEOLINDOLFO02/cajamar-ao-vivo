// Auxiliares dos testes de publicar.js: relógio fixo, API Open-Meteo/INMET fictícias, canvas que registra o que é desenhado e DOM mínimo.
// Todos os dados são FICTÍCIOS. Nada acessa a internet.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { join } from "node:path";
import { RAIZ } from "./util.mjs";
import { criarElemento } from "./auxiliares.mjs";

export const AGORA_SP = "2026-10-30T14:05"; // horário local de Cajamar usado como "agora" nos testes
export const AGORA_MS = Date.UTC(2026, 9, 30, 14, 5) + 3 * 3600000;
const p2 = (n) => String(n).padStart(2, "0");

function addDias(iso, n) {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 86400000);
  return d.getUTCFullYear() + "-" + p2(d.getUTCMonth() + 1) + "-" + p2(d.getUTCDate());
}

// Resposta do Open-Meteo: past_days=7 + forecast_days=7 em torno de "hoje". opcoes.omitirDaily lista campos diários a remover.
export function climaFixture(o = {}) {
  const hoje = o.hoje || "2026-10-30", agora = o.agora || AGORA_SP;
  const dias = [];
  for (let i = -7; i <= 6; i++) dias.push(addDias(hoje, i));
  const preencher = (v) => dias.map(typeof v === "function" ? v : () => v);
  const daily = {
    time: o.diasTime || dias,
    weather_code: preencher(3),
    temperature_2m_max: preencher(27), temperature_2m_min: preencher(16), apparent_temperature_max: preencher(29), apparent_temperature_min: preencher(15),
    uv_index_max: preencher(8), precipitation_sum: preencher(0), precipitation_probability_max: preencher(0),
    wind_speed_10m_max: preencher(18), wind_gusts_10m_max: preencher(35)
  };
  Object.assign(daily, o.daily || {});
  (o.omitirDaily || []).forEach((k) => { delete daily[k]; });
  const horas = [];
  dias.forEach((d) => { for (let h = 0; h < 24; h++) horas.push(d + "T" + p2(h) + ":00"); });
  const hourly = {
    time: o.horasTime || horas,
    temperature_2m: horas.map(() => 22), relative_humidity_2m: horas.map(() => 60), precipitation_probability: horas.map(() => 0),
    precipitation: horas.map(() => 0), weather_code: horas.map(() => 3), wind_speed_10m: horas.map(() => 10)
  };
  Object.assign(hourly, o.hourly || {});
  return { daily, hourly, current: o.semCurrent ? undefined : { time: o.currentTime || agora } };
}

export function avisoFixture(extra) {
  return Object.assign({
    id_aviso: 77, id_sequencia: 1, geocodes: "3509205", encerrado: false, descricao: "Tempestade", severidade: "Perigo",
    inicio: "2026-10-30 08:00", fim: "2026-10-30 23:59", aviso_cor: "#FF7F00", riscos: '["Chuva intensa"]', instrucoes: '["Evite abrigar-se debaixo de árvores"]', poligono: null
  }, extra);
}

export function previsaoFixture() {
  const dia = (dd) => ({ dia_semana: "Sexta-feira", temp_min: 16, temp_max: 27, umidade_min: 40, umidade_max: 90, resumo: "Parcialmente nublado", manha: { resumo: "Nublado" }, tarde: { resumo: "Chuva" }, noite: { resumo: "Nublado" } });
  return { 3509205: { "30/10/2026": dia(), "31/10/2026": dia() } };
}

// Contexto 2D que registra textos e valida bounds; measureText aproxima 0,52 x tamanho da fonte por caractere.
export function criarCanvas(opcoes = {}) {
  const chamadas = [];
  const estado = { font: "10px sans", fillStyle: "#000", textAlign: "left", globalAlpha: 1 };
  let blobsPedidos = 0;
  const ctx = new Proxy(estado, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === "fillText") return (txt, x, y) => {
        if (opcoes.falharEmTexto && String(txt).includes(opcoes.falharEmTexto)) throw new Error("falha simulada ao desenhar");
        chamadas.push({ txt: String(txt), x, y, font: t.font, align: t.textAlign });
      };
      if (p === "measureText") return (txt) => { const m = /(\d+)px/.exec(t.font); return { width: String(txt).length * (m ? +m[1] : 10) * 0.52 }; };
      if (p === "createLinearGradient") return () => ({ addColorStop() {} });
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; }
  });
  const canvas = criarElemento("tela");
  canvas.getContext = () => ctx;
  canvas.width = 1080; canvas.height = 1920;
  canvas.toBlob = (cb) => { blobsPedidos++; if (opcoes.toBlobLanca) throw new Error("toBlob indisponível"); cb(opcoes.toBlobNulo ? null : { size: 10, type: "image/png" }); };
  return { canvas, chamadas, get blobsPedidos() { return blobsPedidos; }, limpar() { chamadas.length = 0; } };
}

function criarSelect(id, inicial) {
  const base = { id, value: inicial || "", children: [], hidden: false, disabled: false, dataset: {}, style: {} };
  return new Proxy(base, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === "appendChild") return (c) => { t.children.push(c); if (t.children.length === 1) t.value = c.value; return c; };
      return () => criarElemento("");
    },
    set(t, p, v) { if (p === "textContent" && v === "") { t.children.length = 0; t.value = ""; } t[p] = v; return true; }
  });
}

// opcoes: { rotas: {clima, avisos, previsao: fn(url)->objeto|throw}, focos: fn()->resultado|throw, cache: {chave: valor}, falharEmTexto, agoraMs, pendenteClima }
export async function abrirPublicar(opcoes = {}) {
  const agoraMs = opcoes.agoraMs || AGORA_MS;
  class DataFixa extends Date {
    constructor(...a) { if (a.length) super(...a); else super(agoraMs); }
    static now() { return agoraMs; }
  }
  const storageDados = {};
  Object.entries(opcoes.cache || {}).forEach(([k, v]) => { storageDados["cajamar:" + k] = JSON.stringify(v); });
  const storage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(storageDados, k) ? storageDados[k] : null),
    setItem: (k, v) => { storageDados[k] = String(v); }, removeItem: (k) => { delete storageDados[k]; }, key: (i) => Object.keys(storageDados)[i], get length() { return Object.keys(storageDados).length; }
  };
  const els = {};
  const cv = criarCanvas({ falharEmTexto: opcoes.falharEmTexto, toBlobLanca: opcoes.toBlobLanca, toBlobNulo: opcoes.toBlobNulo });
  const inicial = { tipo: "flyer_dia", formato: "stories", nivelFaixa: "auto" };
  const document = {
    getElementById(id) {
      if (id === "tela") return cv.canvas;
      if (!els[id]) els[id] = id === "escolha" ? criarSelect(id) : (id in inicial ? criarSelect(id, inicial[id]) : criarElemento(id));
      return els[id];
    },
    createElement() { return criarElemento(""); },
    querySelectorAll() { return []; },
    body: criarElemento("body")
  };
  const rotas = opcoes.rotas || {};
  const chamadasFetch = [];
  const fetch = async (url) => {
    chamadasFetch.push(url);
    let fn = null;
    if (url.includes("open-meteo")) fn = rotas.clima;
    else if (url.includes("avisos/ativos")) fn = rotas.avisos;
    else if (url.includes("/previsao/")) fn = rotas.previsao;
    if (!fn) throw new Error("rota sem resposta nos testes: " + url);
    if (url.includes("open-meteo") && opcoes.pendenteClima) return new Promise(() => {});
    const corpo = await fn(url);
    return { ok: true, status: 200, json: async () => corpo };
  };
  class AbortControllerFalso { constructor() { this.signal = {}; } abort() {} }
  const compartilhamentos = [];
  const ctx = {
    console: opcoes.console || console, document, localStorage: storage, fetch, AbortController: AbortControllerFalso, Promise, setTimeout, clearTimeout, queueMicrotask,
    navigator: { onLine: !opcoes.offline, clipboard: { writeText: async (t) => { compartilhamentos.push(t); } } },
    Image: class { set src(v) { this._src = v; this.width = 100; this.height = 100; queueMicrotask(() => this.onload && this.onload()); } },
    File: class { constructor(partes, nome, o) { this.nome = nome; this.partes = partes; this.type = o && o.type; } },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    Date: DataFixa, Math, JSON, Object, Array, String, Number, parseInt, parseFloat, isFinite, isNaN, Intl, Set, Map, Error, RegExp, encodeURIComponent
  };
  ctx.window = ctx;
  ctx.innerWidth = 1200;
  ctx.addEventListener = () => {};
  for (const f of ["js/fontes.js", "js/inmet.js", "js/estacao.js", "js/deslizamento.js", "js/queimadas.js", "js/publicacao.js"]) {
    runInNewContext(readFileSync(join(RAIZ, f), "utf8"), ctx, { filename: f });
  }
  if (opcoes.focos) ctx.Queimadas.coletarInpeAoVivo = async () => opcoes.focos();
  runInNewContext(readFileSync(join(RAIZ, "js/publicar.js"), "utf8"), ctx, { filename: "js/publicar.js" });
  await esperarTudo();
  return { ctx, els, document, cv, chamadasFetch, compartilhamentos, storageDados, textos: () => cv.chamadas.map((c) => c.txt) };
}

export const esperarTudo = (ms = 80) => new Promise((r) => setTimeout(r, ms));

// focos sem "ts" recebem horário de 2 h antes de "agora" (dentro da janela de 24 h); passe ts explícito para testar focos antigos
export const FOCOS_OK = (focos = []) => ({ coletadoEm: new Date(AGORA_MS - 60000).toISOString(), fonte: "INPE BDQueimadas (teste)", focos: focos.map((f) => ({ ts: AGORA_MS - 2 * 3600000, ...f })), arquivosLidos: 3, arquivosTentados: 3, parcial: false, falhas: [] });
