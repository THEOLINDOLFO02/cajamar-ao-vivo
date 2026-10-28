// Testes da previsão pontual da Windy (rota /windy do Worker). Dados FICTÍCIOS; nenhuma chamada real à internet.
import test from "node:test";
import assert from "node:assert/strict";
import worker, { montarWindy, buscarWindy } from "../worker/cemaden-proxy.js";

const bruto = () => ({
  ts: [1793134800000, 1793145600000, 1793156400000],
  units: {},
  "temp-surface": [300.15, 290.15, null],
  "past3hprecip-surface": [0.0125, 0, -0.0001],
  "wind_u-surface": [0, -10, 3],
  "wind_v-surface": [-10, 0, 4],
  "gust-surface": [20, 5, 0],
  "cape-surface": [1234.6, 0, 10],
  "rh-surface": [80.4, 55, 90],
  "lclouds-surface": [10, 20, 30], "mclouds-surface": [40, 50, 60], "hclouds-surface": [70, 80, 90]
});

test("montarWindy converte Kelvin, m/s e metros para °C, km/h e mm", () => {
  const r = montarWindy(bruto(), new Date("2026-10-27T12:00:00Z"));
  const p = r.pontos[0];
  assert.equal(r.coletadoEm, "2026-10-27T12:00:00.000Z");
  assert.equal(p.tempC, 27);
  assert.equal(p.chuvaMm3h, 12.5);
  assert.equal(p.ventoKmh, 36);
  assert.equal(p.rajadaKmh, 72);
  assert.equal(p.cape, 1235);
  assert.deepEqual(p.nuvens, { baixas: 10, medias: 40, altas: 70 });
});

test("direção do vento é de onde ele vem (norte = 0°)", () => {
  const r = montarWindy(bruto());
  assert.equal(r.pontos[0].direcaoGraus, 0);   // u=0, v=-10: vento vindo do norte
  assert.equal(r.pontos[1].direcaoGraus, 90);  // u=-10, v=0: vindo do leste
});

test("valor ausente vira null e chuva negativa vira zero", () => {
  const r = montarWindy(bruto());
  assert.equal(r.pontos[2].tempC, null);
  assert.equal(r.pontos[2].chuvaMm3h, 0);
});

test("montarWindy limita os passos e rejeita formato inesperado", () => {
  assert.equal(montarWindy(bruto(), new Date(), 2).pontos.length, 2);
  assert.throws(() => montarWindy({}), /formato inesperado/);
  assert.throws(() => montarWindy(null), /formato inesperado/);
});

test("buscarWindy envia a chave só no corpo do POST e trata erros", async () => {
  let visto;
  const buscar = async (url, op) => { visto = { url, op }; return { ok: true, status: 200, json: async () => bruto() }; };
  await buscarWindy({ key: "SEGREDO", buscar });
  assert.equal(visto.op.method, "POST");
  assert.ok(!visto.url.includes("SEGREDO"));
  assert.equal(JSON.parse(visto.op.body).key, "SEGREDO");
  await assert.rejects(buscarWindy({}), /não configurado/);
  await assert.rejects(buscarWindy({ key: "k", buscar: async () => ({ ok: false, status: 400 }) }), /HTTP 400/);
  await assert.rejects(buscarWindy({ key: "k", buscar: async () => ({ ok: false, status: 204 }) }), /não tem esses parâmetros/);
});

test("rota /windy: sem secret responde 503; com secret devolve o JSON; erro não vaza a chave", async () => {
  const req = () => new Request("https://w.exemplo/windy", { headers: { Origin: "http://localhost:8765" } });
  const sem = await worker.fetch(req(), {});
  assert.equal(sem.status, 503);
  assert.equal(sem.headers.get("access-control-allow-origin"), "http://localhost:8765");

  const ok = await worker.fetch(req(), { WINDY_POINT_KEY: "SEGREDO", buscar: async () => ({ ok: true, status: 200, json: async () => bruto() }) });
  assert.equal(ok.status, 200);
  const j = await ok.json();
  assert.equal(j.modelo, "gfs");
  assert.ok(!JSON.stringify(j).includes("SEGREDO"));

  const falha = await worker.fetch(req(), { WINDY_POINT_KEY: "SEGREDO", buscar: async () => { throw new Error("falha com SEGREDO no texto"); } });
  assert.equal(falha.status, 502);
  assert.ok(!(await falha.text()).includes("SEGREDO"));
});

// ---------- js/windy.js (lado do navegador, parte pura) ----------
import { carregarScript } from "./util.mjs";
const { Windy } = carregarScript("js/windy.js");

test("CAPE é classificado nas 4 faixas e valor inválido vira null", () => {
  assert.equal(Windy.classificarCape(500).nome, "Baixa");
  assert.equal(Windy.classificarCape(1500).nome, "Moderada");
  assert.equal(Windy.classificarCape(3000).nome, "Alta");
  assert.equal(Windy.classificarCape(5000).nome, "Extrema");
  for (const v of [null, undefined, NaN, -1, "10"]) assert.equal(Windy.classificarCape(v), null);
});

test("resumir soma a chuva, acha rajada e CAPE máximos nas próximas 24 h", () => {
  const h = 3600000, t = Date.UTC(2026, 9, 27, 12);
  const pontos = [-6, 0, 3, 6, 9, 12, 15, 18, 21, 24, 27].map((d, i) => ({ ts: t + d * h, tempC: 20 + i, chuvaMm3h: 1, rajadaKmh: 10 + i, cape: i * 100, direcaoGraus: 90 }));
  const r = Windy.resumir({ pontos, coletadoEm: "x" }, t);
  assert.equal(r.pontos.length, 8);
  assert.equal(r.pontos[0].ts, t);          // o passo de 6 h atrás fica de fora
  assert.equal(r.chuvaMm, 8);
  assert.equal(r.rajadaMax.v, 10 + 8);
  assert.equal(r.capeMax.v, 800);
  assert.equal(r.tempMin, 21);
});

test("resumir tolera valores ausentes e direção vira ponto cardeal", () => {
  const r = Windy.resumir({ pontos: [{ ts: 1000, tempC: null, chuvaMm3h: null, rajadaKmh: null, cape: null }] }, 1000);
  assert.equal(r.chuvaMm, null);
  assert.equal(r.capeMax, null);
  assert.equal(Windy.direcao(0), "N");
  assert.equal(Windy.direcao(225), "SO");
  assert.equal(Windy.direcao(350), "N");
  assert.equal(Windy.direcao(null), "—");
});

test("validar exige pontos e data de coleta", () => {
  assert.equal(Windy.validar({ pontos: [{}], coletadoEm: "x" }), true);
  assert.equal(Windy.validar({ pontos: [], coletadoEm: "x" }), false);
  assert.equal(Windy.validar({ erro: "x" }), false);
});

test("aviso de chave de teste da Windy é repassado ao painel", () => {
  const b = bruto(); b.warning = "The testing API version is for development purposes only.";
  assert.match(montarWindy(b).aviso, /testing API/);
  assert.equal(montarWindy(bruto()).aviso, null);
});
