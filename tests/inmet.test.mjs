// Testes da leitura dos avisos e da previsão do INMET (js/inmet.js).
// Os dados abaixo são FICTÍCIOS, criados só para testar o código; não representam avisos reais.
import test from "node:test";
import assert from "node:assert/strict";
import { carregarScript } from "./util.mjs";

const { Inmet } = carregarScript("js/inmet.js");
const LAT = -23.3547, LON = -46.8764;

// Quadrado ao redor de um ponto (GeoJSON usa [longitude, latitude]).
function quadrado(lon, lat, meio) {
  return { type: "Polygon", coordinates: [[[lon - meio, lat - meio], [lon + meio, lat - meio], [lon + meio, lat + meio], [lon - meio, lat + meio], [lon - meio, lat - meio]]] };
}
function aviso(extra) {
  return Object.assign({
    id_aviso: 1, id_sequencia: 1, geocodes: "3509205,3547304", encerrado: false,
    descricao: "Tempestade", severidade: "Perigo", inicio: "2026-10-13 08:57", fim: "2026-10-13 23:59",
    aviso_cor: "#FF7F00", riscos: '["Risco A"]', instrucoes: '["Instrução 1","Instrução 2"]',
    poligono: JSON.stringify(JSON.stringify(quadrado(LON, LAT, 0.2))) // duplamente codificado, como a API devolve
  }, extra);
}

test("validar: aceita só o formato esperado", () => {
  assert.equal(Inmet.validarAvisos({ hoje: [], futuro: [] }), true);
  assert.equal(Inmet.validarAvisos({ hoje: [] }), false);
  assert.equal(Inmet.validarAvisos(null), false);
  assert.equal(Inmet.validarPrevisao({ 3509205: {} }), true);
  assert.equal(Inmet.validarPrevisao({ 1234567: {} }), false);
});

test("avisosDoMunicipio: filtra pelo código IBGE, ignora encerrados e repetidos", () => {
  const j = {
    hoje: [
      aviso(),
      aviso({ id_aviso: 2, geocodes: "1100015" }),              // outro município
      aviso({ id_aviso: 3, encerrado: true })                   // encerrado
    ],
    futuro: [aviso(), aviso({ id_aviso: 4, id_sequencia: 2 })]  // o primeiro é repetido
  };
  const r = Inmet.avisosDoMunicipio(j);
  assert.deepEqual([...r.map((a) => a.id)], ["1/1", "4/2"]);
});

test("avisosDoMunicipio: não confunde código parecido (substring)", () => {
  const j = { hoje: [aviso({ geocodes: "13509205,35092050" })], futuro: [] };
  assert.equal(Inmet.avisosDoMunicipio(j).length, 0);
});

test("avisosDoMunicipio: lê riscos, instruções, cor e polígono", () => {
  const [a] = Inmet.avisosDoMunicipio({ hoje: [aviso()], futuro: [] });
  assert.equal(a.risco, "Risco A");
  assert.deepEqual([...a.instrucoes], ["Instrução 1", "Instrução 2"]);
  assert.equal(a.cor, "#FF7F00");
  assert.equal(a.poligono.type, "Polygon");
});

test("avisosDoMunicipio: cor inválida vira null e polígono quebrado vira null (sem lançar erro)", () => {
  const [a] = Inmet.avisosDoMunicipio({ hoje: [aviso({ aviso_cor: "laranja", poligono: "isto não é json" })], futuro: [] });
  assert.equal(a.cor, null);
  assert.equal(a.poligono, null);
});

test("avisosDoMunicipio: aceita polígono codificado uma vez só", () => {
  const [a] = Inmet.avisosDoMunicipio({ hoje: [aviso({ poligono: JSON.stringify(quadrado(LON, LAT, 0.1)) })], futuro: [] });
  assert.equal(a.poligono.type, "Polygon");
});

test("avisosProximos: só avisos de outros municípios cuja área chega perto", () => {
  const perto = aviso({ id_aviso: 10, geocodes: "1100015", poligono: JSON.stringify(quadrado(LON + 0.5, LAT, 0.2)) });   // encosta no raio
  const longe = aviso({ id_aviso: 11, geocodes: "1100015", poligono: JSON.stringify(quadrado(LON + 5, LAT, 0.2)) });     // muito longe
  const doMunicipio = aviso({ id_aviso: 12 });
  const r = Inmet.avisosProximos({ hoje: [perto, longe, doMunicipio], futuro: [] }, LAT, LON, 0.6);
  assert.deepEqual([...r.map((a) => a.id)], ["10/1"]);
});

test("previsaoDoMunicipio: ordena por data real (não por texto) e separa manhã/tarde/noite", () => {
  const j = { 3509205: {
    "01/11/2026": { resumo: "dia", temp_min: 15, temp_max: 25 },
    "30/10/2026": { manha: { resumo: "a" }, tarde: { resumo: "b" }, noite: { resumo: "c" } },
    "02/10/2026": { manha: { resumo: "x" } }
  } };
  const r = Inmet.previsaoDoMunicipio(j);
  assert.deepEqual([...r.map((d) => d.dia)], ["02/10/2026", "30/10/2026", "01/11/2026"]);
  assert.ok(r[1].per, "dia com períodos tem per");
  assert.equal(r[2].per, null, "dia sem períodos não tem per");
  assert.equal(r[2].ref.resumo, "dia");
});
