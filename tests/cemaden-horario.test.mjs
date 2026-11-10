// Conversão do horário do CEMADEN (UTC, sem fuso no texto) para Brasília. Valores calculados à mão.
import test from "node:test";
import assert from "node:assert/strict";
import { carregarScripts } from "./util.mjs";

const ctx = carregarScripts(["js/cemaden.js"]);
const Cemaden = ctx.Cemaden || ctx.window.Cemaden;

test("UTC 01:50 de 10/11/26 vira 22:50 de 09/11 em Brasília (UTC-3)", () => {
  assert.equal(Cemaden.paraBrasilia("10/11/26 01:50", true), "09/11 22:50");
});
test("meio-dia UTC vira 09:00", () => {
  assert.equal(Cemaden.paraBrasilia("09/11/26 12:00", true), "09/11 09:00");
});
test("sem fuso confirmado ou texto inválido não converte", () => {
  assert.equal(Cemaden.paraBrasilia("10/11/26 01:50", false), null);
  assert.equal(Cemaden.paraBrasilia("lixo", true), null);
  assert.equal(Cemaden.paraBrasilia(null, true), null);
});
