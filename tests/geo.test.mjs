// Testes da geometria (js/geo.js) e da leitura dos dados do IBGE (js/municipio.js).
// As figuras abaixo são FICTÍCIAS (quadrados simples), criadas só para testar o código.
import test from "node:test";
import assert from "node:assert/strict";
import { carregarScripts } from "./util.mjs";

const ctx = carregarScripts(["js/geo.js", "js/municipio.js"]);
const { Geo, Municipio } = ctx;

const quadrado = { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] };
const comBuraco = { type: "Polygon", coordinates: [quadrado.coordinates[0], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] };
const duasIlhas = { type: "MultiPolygon", coordinates: [quadrado.coordinates, [[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]]] };

test("pontoDentro: dentro, fora e na outra ilha de um MultiPolygon", () => {
  assert.equal(Geo.pontoDentro(5, 5, quadrado), true);
  assert.equal(Geo.pontoDentro(15, 5, quadrado), false);
  assert.equal(Geo.pontoDentro(25, 25, duasIlhas), true);
  assert.equal(Geo.pontoDentro(15, 15, duasIlhas), false);
});

test("pontoDentro: o buraco do polígono conta como fora", () => {
  assert.equal(Geo.pontoDentro(5, 5, comBuraco), false);
  assert.equal(Geo.pontoDentro(2, 2, comBuraco), true);
});

test("aceita Feature e FeatureCollection e ignora entrada inválida sem lançar erro", () => {
  assert.equal(Geo.pontoDentro(5, 5, { type: "Feature", geometry: quadrado }), true);
  assert.equal(Geo.pontoDentro(5, 5, { type: "FeatureCollection", features: [{ type: "Feature", geometry: quadrado }] }), true);
  for (const ruim of [null, undefined, {}, { type: "Point", coordinates: [1, 1] }, "texto"]) assert.equal(Geo.pontoDentro(5, 5, ruim), false);
});

test("distanciaBordaKm: 0,1 grau de latitude vale cerca de 11 km", () => {
  const km = Geo.distanciaBordaKm(5, 10.1, quadrado); // 0,1° ao norte da borda
  assert.ok(km > 10.8 && km < 11.4, "distância fora do esperado: " + km);
  assert.ok(Geo.distanciaBordaKm(5, 5, quadrado) > 500, "do centro até a borda são centenas de km");
});

test("limites devolve [oeste, sul, leste, norte]", () => {
  assert.deepEqual([...Geo.limites(duasIlhas)], [0, 0, 30, 30]);
});

test("Municipio.geometria: aceita a resposta do IBGE (FeatureCollection) e rejeita vazio", () => {
  const resposta = { type: "FeatureCollection", features: [{ type: "Feature", properties: { codarea: "3509205" }, geometry: quadrado }] };
  assert.equal(Municipio.geometria(resposta).type, "Polygon");
  assert.equal(Municipio.geometria({ type: "FeatureCollection", features: [] }), null);
  assert.equal(Municipio.geometria(null), null);
  assert.equal(Municipio.geometria({ erro: "x" }), null);
});

test("Municipio.valor2022: lê o formato do IBGE e devolve null se vier diferente", () => {
  const ok = [{ resultados: [{ series: [{ serie: { 2022: "92689" } }] }] }];
  assert.equal(Municipio.valor2022(ok), 92689);
  assert.equal(Municipio.valor2022([{ resultados: [{ series: [{ serie: { 2022: "..." } }] }] }]), null);
  assert.equal(Municipio.valor2022({ statusCode: 500 }), null);
  assert.equal(Municipio.valor2022(null), null);
});
