// Testes da leitura do CSV da estação e do resumo por dia (js/estacao.js).
// O CSV abaixo é FICTÍCIO, montado só para testar o código (não é dado real).
import test from "node:test";
import assert from "node:assert/strict";
import { carregarScript } from "./util.mjs";

const { Estacao } = carregarScript("js/estacao.js");

const CABECALHO = "tenant;sn;alias;category;data_hora;data_hora_brt;timestamp_ms;temperature_c;humidity_percent;pressure_hpa;wind_speed_mps;wind_speed_kmh;wind_direction_degrees;intensity_mm;accumulated_mm;rain_interval_mm;water_level_m;solar_radiation_wm2";
const p2 = (n) => String(n).padStart(2, "0");

// Uma leitura por minuto. dia = "10/01/2026"; minuto = 0..1439. Fuso fixo -03 (BRT), como no arquivo real.
function linha(dia, minuto, o = {}) {
  const [d, m, a] = dia.split("/").map(Number);
  const ts = Date.UTC(a, m - 1, d, 3, 0) + minuto * 60000;
  const temp = o.temp === undefined ? "15,0" : o.temp;
  return ["cajamar", "1", "Estação de Teste", "meteorologica", "", `${dia} ${p2(Math.floor(minuto / 60))}:${p2(minuto % 60)}:00`, ts,
    temp, "70,0", "935,0", "1", o.vento ?? "5,0", "180", "0", "0", o.chuva ?? "0", "", o.rad ?? "0"].join(";");
}

function csvDeUmDia() {
  const l = [CABECALHO];
  for (let min = 0; min < 1440; min++) {
    const o = {};
    if (min >= 100 && min <= 104) o.chuva = "0,2";   // 5 × 0,2 = 1,0 mm em 5 minutos
    if (min === 130) o.chuva = "0,4";
    if (min === 500) o.chuva = "1,2";                // rajada isolada
    if (min === 5) o.temp = "10,5";
    if (min === 800) o.temp = "25,5";
    if (min === 900) o.vento = "30,6";
    l.push(linha("10/01/2026", min, o));
  }
  return l.join("\r\n");
}

test("lerCsv: lê decimal com vírgula, BOM e delimitador ponto e vírgula", () => {
  const rows = Estacao.lerCsv("﻿" + csvDeUmDia());
  assert.equal(rows.length, 1440);
  assert.equal(rows[5].t, 10.5);
  assert.equal(rows[0].dia, "2026-01-10");
  assert.equal(rows[100].ch, 0.2);
});

test("lerCsv: falha com mensagem clara se faltarem colunas", () => {
  assert.throws(() => Estacao.lerCsv("a;b\n1;2"), /colunas ausentes/);
  assert.throws(() => Estacao.lerCsv("só uma linha"), /vazio/);
});

test("lerCsv: ignora linhas sem data válida e valor vazio vira null (não zero)", () => {
  const txt = [CABECALHO, linha("10/01/2026", 0, { temp: "" }), "x;x;x;x;x;sem data;abc;1;1;1;1;1;1;1;1;1;;1", linha("10/01/2026", 1)].join("\n");
  const rows = Estacao.lerCsv(txt);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].t, null);
  assert.equal(rows[1].t, 15);
});

test("resumir: soma a chuva do dia e calcula temperatura e vento", () => {
  const r = Estacao.resumir(Estacao.lerCsv(csvDeUmDia()))["2026-01-10"];
  assert.equal(r.n, 1440);
  assert.equal(r.chuva, 2.6);
  assert.equal(r.tmin, 10.5);
  assert.equal(r.tmax, 25.5);
  assert.equal(r.vmax, 30.6);
});

test("resumir: maior chuva em 10 min e em 1 h usa janela deslizante", () => {
  const r = Estacao.resumir(Estacao.lerCsv(csvDeUmDia()))["2026-01-10"];
  assert.equal(r.c10, 1.2, "a rajada isolada de 1,2 mm é a maior janela de 10 min (a primeira chuva dá 1,0)");
  assert.equal(r.c60, 1.4, "1,0 (minutos 100-104) + 0,4 (minuto 130) cabem em 1 hora");
});

test("resumir: duas pancadas com 12 min de intervalo não somam na janela de 10 min, mas somam na de 1 h", () => {
  const l = [CABECALHO];
  for (let m = 0; m < 1440; m++) l.push(linha("10/01/2026", m, m === 700 || m === 712 ? { chuva: "0,9" } : {}));
  const r = Estacao.resumir(Estacao.lerCsv(l.join("\n")))["2026-01-10"];
  assert.equal(r.c10, 0.9);
  assert.equal(r.c60, 1.8);
});

test("resumir: leituras repetidas (mesmo instante) não contam duas vezes", () => {
  const linhas = csvDeUmDia().split("\r\n");
  linhas.push(linhas[1 + 100]); // repete a leitura do minuto 100 (0,2 mm)
  const r = Estacao.resumir(Estacao.lerCsv(linhas.join("\r\n")))["2026-01-10"];
  assert.equal(r.n, 1440);
  assert.equal(r.chuva, 2.6);
});

test("resumir: separa dias e informa quantas leituras cada um teve", () => {
  const l = [CABECALHO];
  for (let m = 0; m < 1440; m++) l.push(linha("10/01/2026", m));
  for (let m = 0; m < 60; m++) l.push(linha("11/01/2026", m));
  const r = Estacao.resumir(Estacao.lerCsv(l.join("\n")));
  assert.deepEqual(Object.keys(r).sort(), ["2026-01-10", "2026-01-11"]);
  assert.equal(r["2026-01-10"].n, 1440);
  assert.equal(r["2026-01-11"].n, 60, "dia parcial aparece com poucas leituras");
});

test("resumir: chuva do dia com dia sem chuva dá zero (e não null)", () => {
  const l = [CABECALHO];
  for (let m = 0; m < 30; m++) l.push(linha("10/01/2026", m));
  const r = Estacao.resumir(Estacao.lerCsv(l.join("\n")))["2026-01-10"];
  assert.equal(r.chuva, 0);
  assert.equal(r.c10, 0);
});
