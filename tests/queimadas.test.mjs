// Testes do módulo de monitoramento de queimadas e satélites (js/queimadas.js).
import test from "node:test";
import assert from "node:assert/strict";
import { carregarScript } from "./util.mjs";

const { Queimadas } = carregarScript("js/queimadas.js");

test("SATELITES: inclui AQUA_M-M, AQUA_M-T, GOES-19, METOP-B, METOP-C, MSG-03, NOAA-20, NOAA-21, TERRA_M-M, TERRA_M-T, NPP-375 (Tarde) e Manhã NPP-375", () => {
  const ids = Queimadas.SATELITES.map((s) => s.id);
  for (const esperado of ["AQUA_M-M", "AQUA_M-T", "GOES-19", "METOP-B", "METOP-C", "MSG-03", "NOAA-20", "NOAA-21", "TERRA_M-M", "TERRA_M-T", "NPP-375", "NPP-375D"]) {
    assert.ok(ids.includes(esperado), `Catálogo deveria conter o satélite ${esperado}`);
  }
  assert.equal(Queimadas.rotuloSatelite("NPP-375D"), "Manhã NPP-375");
  assert.equal(Queimadas.rotuloSatelite("NPP-375"), "NPP-375 (Tarde)");
  assert.equal(Queimadas.grupoSatelite("AQUA_M-M"), "AQUA_M-M");
  assert.equal(Queimadas.grupoSatelite("AQUA_M-T"), "AQUA_M-T");
  assert.equal(Queimadas.grupoSatelite("TERRA_M-M"), "TERRA_M-M");
  assert.equal(Queimadas.grupoSatelite("TERRA_M-T"), "TERRA_M-T");
});

test("lerCsvFocos: lê formato diário do INPE, calcula distância a Cajamar e identifica foco no município", () => {
  const csv = [
    "id,lat,lon,data_hora_gmt,satelite,municipio,estado,pais,municipio_id,estado_id,pais_id,numero_dias_sem_chuva,precipitacao,risco_fogo,bioma,frp",
    "f1,-23.3550,-46.8770,2026-10-18 16:30:00,NPP-375,CAJAMAR,SÃO PAULO,Brasil,3509205,35,33,6,0.0,0.95,Mata Atlântica,42.5",
    "f2,-23.1857,-46.8978,2026-10-18 16:35:00,NOAA-20,JUNDIAÍ,SÃO PAULO,Brasil,3525904,35,33,4,0.0,0.80,Mata Atlântica,18.0",
    "f3,-2.7191,-45.2208,2026-10-18 00:00:00,GOES-19,PINHEIRO,MARANHÃO,Brasil,2108603,21,33,,,,Amazônia,459.1"
  ].join("\n");

  const focos = Queimadas.consolidarFocos(Queimadas.lerCsvFocos(csv, 100));
  assert.equal(focos.length, 2, "deve filtrar o foco distante fora de SP");
  assert.equal(focos[0].emCajamar, true);
  assert.equal(focos[0].municipio, "CAJAMAR");
  assert.equal(focos[0].dataHoraBrt, "18/10 13:30");
  assert.equal(focos[0].frp, 42.5);
  assert.equal(focos[1].municipio, "JUNDIAÍ");
  assert.ok(focos[1].distanciaKm > 10 && focos[1].distanciaKm < 30);
});

test("calcularRiscoFogoLocal: avalia Regra dos 30 e índice de Angström", () => {
  const critico = Queimadas.calcularRiscoFogoLocal({ temp: 33, umid: 22, vento: 32, rajada: 40, chuva24h: 0 });
  assert.equal(critico.classe, "v");
  assert.equal(critico.regra30, 3);

  const baixo = Queimadas.calcularRiscoFogoLocal({ temp: 19, umid: 85, vento: 8, rajada: 12, chuva24h: 15 });
  assert.equal(baixo.classe, "ok");
});

test("Ventos: catálogo inclui ADM-Aeolus, QuikSCAT, GOES, Meteosat, MetOp ASCAT, CYGNSS, Sentinel-1 e WindSat, e converte rosa dos ventos", () => {
  const { Ventos } = carregarScript("js/painel-vento.js");
  const ids = Ventos.SATELITES_VENTO.map((s) => s.id);
  for (const esp of ["GOES", "METEOSAT", "ADM-AEOLUS", "QUIKSCAT", "METOP-ASCAT", "CYGNSS", "SENTINEL-1", "WINDSAT"]) {
    assert.ok(ids.includes(esp), `Catálogo de ventos deveria conter ${esp}`);
  }
  assert.equal(Ventos.rosaDosVentos(0).sigla, "N");
  assert.equal(Ventos.rosaDosVentos(90).sigla, "E");
  assert.equal(Ventos.rosaDosVentos(180).sigla, "S");
  assert.equal(Ventos.rosaDosVentos(270).sigla, "W");
  assert.equal(Ventos.escalaBeaufort(65).forca, 8);
});
