// Auxiliares dos testes do histórico: CSV fictício de chuva, armazenamento falso e DOM mínimo para historico.js.
// Todos os dados são FICTÍCIOS, montados só para testar o código.
export const CABECALHO_CSV = "tenant;sn;alias;category;data_hora;data_hora_brt;timestamp_ms;temperature_c;humidity_percent;pressure_hpa;wind_speed_mps;wind_speed_kmh;wind_direction_degrees;intensity_mm;accumulated_mm;rain_interval_mm;water_level_m;solar_radiation_wm2";

const p2 = (n) => String(n).padStart(2, "0");

// Gera um CSV de estação com uma leitura a cada passoMin minutos, começando às 00:00 BRT de `inicio` (YYYY-MM-DD).
// chuva(i) devolve o texto de rain_interval_mm da leitura i; omitir(i) remove a leitura i (lacuna).
export function gerarCsvChuva({ inicio = "2026-01-01", horas = 168, passoMin = 5, chuva = () => "0,1", omitir = () => false, nome = "Estação de Teste", sn = "1", embaralhar = false, repetir = [] } = {}) {
  const [a, m, d] = inicio.split("-").map(Number);
  const ts0 = Date.UTC(a, m - 1, d, 3, 0);
  const linhas = [];
  const total = Math.round((horas * 60) / passoMin);
  for (let i = 0; i < total; i++) {
    if (omitir(i)) continue;
    const ts = ts0 + i * passoMin * 60000;
    const b = new Date(ts - 3 * 3600000);
    const dh = `${p2(b.getUTCDate())}/${p2(b.getUTCMonth() + 1)}/${b.getUTCFullYear()} ${p2(b.getUTCHours())}:${p2(b.getUTCMinutes())}:00`;
    linhas.push(["cajamar", sn, nome, "meteorologica", "", dh, ts, "15,0", "70,0", "935,0", "1", "5,0", "180", "0", "0", chuva(i), "", "0"].join(";"));
  }
  repetir.forEach((i) => { if (linhas[i]) linhas.push(linhas[i]); });
  if (embaralhar) linhas.reverse();
  return [CABECALHO_CSV].concat(linhas).join("\n");
}

// localStorage falso. falharNaEscrita = nº da escrita (1, 2, ...) que lança erro; falharSempre faz toda escrita falhar.
export function criarStorage(iniciais = {}, opcoes = {}) {
  const dados = { ...iniciais };
  let escritas = 0;
  return {
    dados,
    get escritas() { return escritas; },
    getItem(k) { return Object.prototype.hasOwnProperty.call(dados, k) ? dados[k] : null; },
    setItem(k, v) {
      escritas++;
      if (opcoes.falharSempre || (opcoes.falharNaEscrita && escritas === opcoes.falharNaEscrita)) throw new Error("QuotaExceededError simulado");
      dados[k] = String(v);
    },
    removeItem(k) { delete dados[k]; }
  };
}

// Elemento de DOM mínimo: propriedades conhecidas têm valor inicial; qualquer outro método vira função inócua.
export function criarElemento(id) {
  const base = { id, hidden: false, textContent: "", innerHTML: "", value: "", disabled: false, className: "", dataset: {}, style: {}, files: [], children: [], title: "" };
  return new Proxy(base, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === "appendChild") return (c) => { t.children.push(c); return c; };
      if (p === "querySelector" || p === "closest") return () => null;
      return () => criarElemento("");
    },
    set(t, p, v) { t[p] = v; return true; }
  });
}

// Arquivo falso para o FileReader falso.
export function arquivoFalso(nome, texto, tamanho) {
  return { name: nome, size: tamanho === undefined ? texto.length : tamanho, __texto: texto };
}

export function criarAmbienteHistorico(storage) {
  const els = {};
  const document = {
    getElementById(id) { return els[id] || (els[id] = criarElemento(id)); },
    createElement() { return criarElemento(""); },
    createElementNS() { return criarElemento(""); },
    body: criarElemento("body")
  };
  class FileReaderFalso {
    readAsText(f) {
      queueMicrotask(() => {
        if (f.__erro) { this.error = new Error(f.__erro); this.onerror && this.onerror(); return; }
        this.result = f.__texto; this.onload && this.onload();
      });
    }
  }
  const ctx = {
    console, document, localStorage: storage, FileReader: FileReaderFalso, Promise, setTimeout, clearTimeout, queueMicrotask,
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} }, Blob: class {}, confirm: () => true, Date, Math, JSON, Object, Array, String, Number, parseFloat, isFinite, isNaN
  };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.print = () => {};
  return { ctx, els, document };
}

export const esperar = (ms = 30) => new Promise((r) => setTimeout(r, ms));
