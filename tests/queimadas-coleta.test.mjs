// Coleta ao vivo de focos do INPE (js/queimadas.js) com fetch simulado: consulta completa, parcial e indisponível.
// Dados FICTÍCIOS; nada acessa a internet.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { join } from "node:path";
import { RAIZ } from "./util.mjs";

const CAB10 = "lat,lon,satelite,data";
const LISTA_DIARIO = '<a href="focos_diario_br_20261029.csv">a</a><a href="focos_diario_br_20261030.csv">b</a>';
const LISTA_10MIN = '<a href="focos_10min_20261030_1330.csv">a</a><a href="focos_10min_20261030_1340.csv">b</a><a href="focos_10min_20261030_1350.csv">c</a>';
const CSV_DIARIO = [
  "id,lat,lon,data_hora_gmt,satelite,municipio,estado,pais,municipio_id,estado_id,pais_id,numero_dias_sem_chuva,precipitacao,risco_fogo,bioma,frp",
  "f1,-23.3550,-46.8770,2026-10-30 16:30:00,NPP-375,CAJAMAR,SÃO PAULO,Brasil,3509205,35,33,6,0.0,0.95,Mata Atlântica,42.5"
].join("\n");
const CSV_VAZIO_DIARIO = "id,lat,lon,data_hora_gmt,satelite,municipio,estado,pais,municipio_id,estado_id,pais_id,numero_dias_sem_chuva,precipitacao,risco_fogo,bioma,frp";

function ambiente(resposta) {
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    fetch: async (url) => {
      const r = resposta(url);
      if (r instanceof Error) throw r;
      return { ok: r.ok !== false, status: r.status || 200, text: async () => r.texto };
    },
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    setTimeout, clearTimeout, Promise, Date, Math, JSON, Object, Array, String, Number, RegExp, Error, parseFloat, parseInt, isFinite, isNaN
  };
  ctx.window = ctx;
  runInNewContext(readFileSync(join(RAIZ, "js/queimadas.js"), "utf8"), ctx, { filename: "js/queimadas.js" });
  return ctx.Queimadas;
}

const respostaBase = (diario, min10) => (url) => {
  if (/\/diario\/Brasil\/$/.test(url)) return { texto: LISTA_DIARIO };
  if (/\/10min\/$/.test(url)) return { texto: LISTA_10MIN };
  if (url.includes("focos_diario_br_")) return diario(url);
  if (url.includes("focos_10min_")) return min10(url);
  return new Error("rota inesperada " + url);
};

test("coleta completa: todos os arquivos lidos, sem falhas, não é parcial", async () => {
  const Q = ambiente(respostaBase(() => ({ texto: CSV_DIARIO }), () => ({ texto: CAB10 })));
  const r = await Q.coletarInpeAoVivo();
  assert.equal(r.arquivosTentados, 5);
  assert.equal(r.arquivosLidos, 5);
  assert.equal(r.parcial, false);
  assert.equal(r.falhas.length, 0);
  assert.equal(r.focos.length, 1);
  assert.match(r.fonte, /INPE/);
  assert.ok(!isNaN(Date.parse(r.coletadoEm)));
});

test("consulta válida sem focos: lista vazia COM todos os arquivos lidos (zero legítimo)", async () => {
  const Q = ambiente(respostaBase(() => ({ texto: CSV_VAZIO_DIARIO }), () => ({ texto: CAB10 })));
  const r = await Q.coletarInpeAoVivo();
  assert.equal(r.focos.length, 0);
  assert.equal(r.parcial, false);
  assert.equal(r.arquivosLidos, r.arquivosTentados);
});

test("coleta parcial: um arquivo com erro HTTP é registrado e a consulta é marcada como parcial", async () => {
  const Q = ambiente(respostaBase((url) => (url.includes("20261029") ? { ok: false, status: 500, texto: "" } : { texto: CSV_DIARIO }), () => ({ texto: CAB10 })));
  const r = await Q.coletarInpeAoVivo();
  assert.equal(r.parcial, true);
  assert.equal(r.arquivosLidos, 4);
  assert.equal(r.arquivosTentados, 5);
  assert.equal(r.falhas.length, 1);
  assert.match(r.falhas[0], /focos_diario_br_20261029\.csv: HTTP 500/);
  assert.equal(r.focos.length, 1, "o que foi lido é mantido, mas a consulta não vale como completa");
});

test("risco de fogo: vento ou chuva ausentes NÃO viram 0 — o indicador deixa de ser calculado", () => {
  const Q = ambiente(() => new Error("sem rede"));
  assert.equal(Q.calcularRiscoFogoLocal({ temp: 30, umid: 20 }), null);
  assert.equal(Q.calcularRiscoFogoLocal({ temp: 30, umid: 20, vento: 10 }), null);
  assert.equal(Q.calcularRiscoFogoLocal({ temp: 30, umid: 20, chuva24h: 0 }), null);
  assert.equal(Q.calcularRiscoFogoLocal({ temp: 30, umid: null, vento: 10, chuva24h: 0 }), null);
  const ok = Q.calcularRiscoFogoLocal({ temp: 30, umid: 20, vento: 10, chuva24h: 0 });
  assert.ok(ok && ok.nivel, "com todos os dados (inclusive chuva 0 informada) calcula");
});

test("INPE fora do ar: a coleta REJEITA (nunca devolve lista vazia como se fosse “sem focos”)", async () => {
  const Q = ambiente(() => new Error("rede caiu"));
  await assert.rejects(Q.coletarInpeAoVivo(), /servidor de focos do INPE indisponível/);
});
