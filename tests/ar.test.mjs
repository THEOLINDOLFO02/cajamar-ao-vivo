// Testes da qualidade do ar e UV (js/ar.js). Os dados abaixo são FICTÍCIOS, criados só para testar o código.
import test from "node:test";
import assert from "node:assert/strict";
import { carregarScripts } from "./util.mjs";

const { Ar } = carregarScripts(["js/serie-om.js", "js/ar.js"]);

test("US AQI: limites de cada faixa", () => {
  const nomes = [[0, "Boa"], [50, "Boa"], [51, "Moderada"], [100, "Moderada"], [101, "Ruim para grupos sensíveis"], [150, "Ruim para grupos sensíveis"], [151, "Ruim"], [200, "Ruim"], [201, "Muito ruim"], [300, "Muito ruim"], [301, "Perigosa"], [500, "Perigosa"]];
  for (const [v, nome] of nomes) assert.equal(Ar.classificarAqi(v).nome, nome, "AQI " + v);
});

test("US AQI: valor inválido não vira 'Boa' (devolve null)", () => {
  for (const v of [null, undefined, NaN, -1, "50", Infinity]) assert.equal(Ar.classificarAqi(v), null, String(v));
});

test("UV (OMS): limites de cada faixa", () => {
  // O índice UV é inteiro (arredondado): 2,4 -> 2 (Baixo); 2,5 e 2,9 -> 3 (Moderado); 7,4 -> 7 (Alto); 7,5 -> 8 (Muito alto); 10,4 -> 10; 10,5 -> 11 (Extremo)
  const nomes = [[0, "Baixo"], [2.4, "Baixo"], [2.5, "Moderado"], [2.9, "Moderado"], [3, "Moderado"], [5.4, "Moderado"], [5.5, "Alto"], [6, "Alto"], [7.4, "Alto"], [7.5, "Muito alto"], [8, "Muito alto"], [10.4, "Muito alto"], [10.5, "Extremo"], [14, "Extremo"]];
  for (const [v, nome] of nomes) assert.equal(Ar.classificarUv(v).nome, nome, "UV " + v);
  assert.equal(Ar.classificarUv(null), null);
});

function resposta() {
  const tempos = [];
  for (let d of ["2026-10-22", "2026-10-23"]) for (let h = 0; h < 24; h++) tempos.push(`${d}T${String(h).padStart(2, "0")}:00`);
  const aqi = tempos.map((t, i) => 40 + (i === 15 ? 30 : 0));           // pico de 70 às 15h do dia 22
  const uv = tempos.map((t) => { const h = Number(t.slice(11, 13)); return h >= 6 && h <= 18 ? Math.max(0, 10 - Math.abs(12 - h) * 1.5) : 0; });
  return { current: { time: "2026-10-22T10:00", us_aqi: 45, pm2_5: 8.3, pm10: 12.1, ozone: 96, uv_index: 7.5 }, hourly: { time: tempos, us_aqi: aqi, uv_index: uv } };
}

test("resumir: valores de agora, pior AQI em 24 h e UV máximo do dia", () => {
  const r = Ar.resumir(resposta());
  assert.equal(r.aqi, 45);
  assert.equal(r.pm25, 8.3);
  assert.equal(r.hora, "10:00");
  assert.deepEqual({ ...r.piorAqi24h }, { v: 70, hora: "15h" });
  assert.deepEqual({ ...r.uvMaxDia }, { v: 10, hora: "12h" });
});

test("resumir: campos ausentes ou nulos viram null (nunca zero)", () => {
  const r = Ar.resumir({ current: { time: "2026-10-22T10:00", us_aqi: null }, hourly: { time: ["2026-10-22T10:00"], us_aqi: [null], uv_index: [null] } });
  assert.equal(r.aqi, null);
  assert.equal(r.uv, null);
  assert.equal(r.piorAqi24h, null);
  assert.equal(r.uvMaxDia, null);
});

test("validar: só aceita a resposta no formato esperado", () => {
  assert.equal(Ar.validar(resposta()), true);
  assert.equal(Ar.validar({ current: {} }), false);
  assert.equal(Ar.validar(null), false);
});
