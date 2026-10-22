// Testes da comparação entre modelos de chuva (js/modelos.js). Os dados abaixo são FICTÍCIOS, criados só para testar o código.
import test from "node:test";
import assert from "node:assert/strict";
import { carregarScript } from "./util.mjs";

const { Modelos } = carregarScript("js/modelos.js");

// 72 horas a partir de 2026-10-22T00:00; "agora" = 11:15 (índice 11).
function resposta(porModelo) {
  const tempos = [];
  for (const d of ["2026-10-22", "2026-10-23", "2026-10-24"]) for (let h = 0; h < 24; h++) tempos.push(`${d}T${String(h).padStart(2, "0")}:00`);
  const hourly = { time: tempos };
  for (const [id, fn] of Object.entries(porModelo)) hourly["precipitation_" + id] = tempos.map((t, i) => fn(i));
  return { current: { time: "2026-10-22T11:15", precipitation: 0 }, hourly };
}
const nada = () => 0;

test("totais: soma 24 h e 24-48 h a partir da hora atual (não do começo do dia)", () => {
  // 1 mm só nas horas 11 a 34 (primeiras 24 h a partir de agora) e 2 mm nas horas 35 a 58 (24 a 48 h)
  const j = resposta({ best_match: (i) => (i >= 11 && i < 35 ? 1 : i >= 35 && i < 59 ? 2 : 0), ecmwf_ifs025: nada, gfs_seamless: nada, icon_seamless: nada, gem_seamless: nada, meteofrance_seamless: nada });
  const t = Modelos.totais(j);
  assert.equal(t.referencia.h24, 24);
  assert.equal(t.referencia.h48, 48);
  assert.equal(t.hora, "11:15");
  assert.equal(t.modelos.length, 5);
});

test("totais: hora faltando deixa o total do modelo como null (nunca completa com zero)", () => {
  const j = resposta({ best_match: nada, ecmwf_ifs025: (i) => (i === 20 ? null : 1), gfs_seamless: nada, icon_seamless: nada, gem_seamless: nada, meteofrance_seamless: nada });
  const t = Modelos.totais(j);
  const ecmwf = t.modelos.find((m) => m.id === "ecmwf_ifs025");
  assert.equal(ecmwf.h24, null, "tem hora nula dentro das próximas 24 h");
  assert.equal(ecmwf.h48, 24, "a janela de 24 a 48 h está completa");
});

test("totais: modelo que não veio na resposta fica null", () => {
  const t = Modelos.totais(resposta({ best_match: nada }));
  assert.equal(t.modelos[0].h24, null);
  assert.equal(t.modelos[0].h48, null);
});

test("resumirJanela: mínimo, máximo, média, amplitude e quantos preveem chuva", () => {
  const r = Modelos.resumirJanela([8.7, 10, 15.5, 2.7, 5.4]);
  assert.equal(r.n, 5);
  assert.equal(r.min, 2.7);
  assert.equal(r.max, 15.5);
  assert.equal(r.amplitude, 12.8);
  assert.equal(r.media, 8.5);
  assert.equal(r.comChuva, 5);
});

test("resumirJanela: ignora null e devolve null quando não há dado", () => {
  assert.equal(Modelos.resumirJanela([null, undefined, NaN]), null);
  assert.equal(Modelos.resumirJanela([]), null);
  assert.equal(Modelos.resumirJanela([null, 4, null]).n, 1);
});

test("resumirJanela: 'preveem chuva' usa o limite de 1 mm", () => {
  assert.equal(Modelos.resumirJanela([0.9, 1, 1.1, 0]).comChuva, 2);
});

test("concordância: poucos milímetros em todos os modelos", () => {
  const c = Modelos.concordancia(Modelos.resumirJanela([0, 0.2, 0.5, 0, 0.9]));
  assert.equal(c.nivel, 0);
  assert.match(c.nome, /pouca ou nenhuma chuva/);
});

test("concordância: boa quando a diferença é pequena (menos de 3 mm ou menos de 35% do máximo)", () => {
  assert.equal(Modelos.concordancia(Modelos.resumirJanela([2, 4, 3])).nivel, 0, "diferença de 2 mm");
  assert.equal(Modelos.concordancia(Modelos.resumirJanela([30, 33, 36, 32])).nivel, 0, "diferença de 6 mm = 17% do máximo");
});

test("concordância: moderada e divergência alta", () => {
  assert.equal(Modelos.concordancia(Modelos.resumirJanela([8, 14, 11])).nivel, 1, "diferença de 6 mm = 43% do máximo");
  const alta = Modelos.concordancia(Modelos.resumirJanela([4.2, 7.4, 15.7, 19.4, 14]));
  assert.equal(alta.nivel, 2, "diferença de 15,2 mm = 78% do máximo");
  assert.match(alta.nome, /divergem muito/);
});

test("concordância: sem dado devolve null", () => {
  assert.equal(Modelos.concordancia(null), null);
});

test("validar: só aceita o formato esperado da resposta", () => {
  assert.equal(Modelos.validar(resposta({ best_match: nada })), true);
  assert.equal(Modelos.validar({ hourly: { time: [] } }), false);
  assert.equal(Modelos.validar(null), false);
});

test("a consulta pede os 5 modelos mais o padrão do painel, em fuso de São Paulo", () => {
  for (const id of ["best_match", "ecmwf_ifs025", "gfs_seamless", "icon_seamless", "gem_seamless", "meteofrance_seamless"]) assert.ok(Modelos.URL.includes(id), id);
  assert.ok(Modelos.URL.includes("America%2FSao_Paulo"));
});
