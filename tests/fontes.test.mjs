// Consulta de fontes com último dado válido (js/fontes.js): cache validado, motivo da falha e nenhum erro engolido. Dados FICTÍCIOS.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { join } from "node:path";
import { RAIZ } from "./util.mjs";
import { criarStorage } from "./auxiliares.mjs";

function ambiente({ resposta, dados = {}, opcoes } = {}) {
  const st = criarStorage(dados, opcoes);
  st.key = (i) => Object.keys(st.dados)[i];
  Object.defineProperty(st, "length", { get: () => Object.keys(st.dados).length });
  const avisos = [];
  const ctx = {
    console: { warn: (...a) => avisos.push(a.join(" ")), error: (...a) => avisos.push(a.join(" ")), log() {} },
    localStorage: st, navigator: { onLine: false },
    fetch: async (url) => { const r = resposta(url); if (r instanceof Error) throw r; return { ok: r.ok !== false, status: r.status || 200, json: async () => r.corpo }; },
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    setTimeout, clearTimeout, Promise, Date, Math, JSON, Object, Array, String, Number, Error, isFinite
  };
  ctx.window = ctx;
  runInNewContext(readFileSync(join(RAIZ, "js/fontes.js"), "utf8"), ctx, { filename: "js/fontes.js" });
  return { Fontes: ctx.Fontes, st, avisos };
}
const ehLista = (j) => !!j && Array.isArray(j.avisos);

test("consulta bem-sucedida guarda o dado e informa que NÃO é antigo", async () => {
  const { Fontes, st } = ambiente({ resposta: () => ({ corpo: { avisos: [] } }) });
  const r = await Fontes.consultar("x", "http://a", ehLista);
  assert.equal(r.antigo, false);
  assert.ok(st.getItem("cajamar:x"));
  assert.equal(Fontes.estado.x.estado, "ok");
});

test("falha com dado guardado: devolve o último dado válido, a data dele e o MOTIVO da falha", async () => {
  const guardado = { t: 1700000000000, d: { avisos: [1] } };
  const { Fontes } = ambiente({ resposta: () => ({ ok: false, status: 503 }), dados: { "cajamar:x": JSON.stringify(guardado) } });
  const r = await Fontes.consultar("x", "http://a", ehLista);
  assert.equal(r.antigo, true);
  assert.equal(r.de, 1700000000000);
  assert.equal(r.erro, "HTTP 503");
  assert.equal(Fontes.estado.x.estado, "velho");
});

test("dado guardado em formato inesperado NÃO é usado como último dado válido", async () => {
  const lixo = { t: 1700000000000, d: { naoEhLista: true } };
  const { Fontes, avisos } = ambiente({ resposta: () => new Error("rede"), dados: { "cajamar:x": JSON.stringify(lixo) } });
  await assert.rejects(Fontes.consultar("x", "http://a", ehLista), /rede/);
  assert.equal(Fontes.lerGuardado("x", ehLista), null);
  assert.ok(Fontes.lerGuardado("x"), "sem validador o conteúdo continua legível");
  assert.ok(avisos.some((a) => /formato inesperado/.test(a)), "o descarte é registrado");
  assert.equal(Fontes.estado.x.estado, "erro");
});

test("falha sem nenhum dado guardado lança o erro (quem chama decide; não vira 'vazio')", async () => {
  const { Fontes } = ambiente({ resposta: () => new Error("sem rede") });
  await assert.rejects(Fontes.consultar("y", "http://a", ehLista), /sem rede/);
  assert.equal(Fontes.estado.y.estado, "erro");
  assert.equal(Fontes.estado.y.msg, "sem rede");
});

test("resposta fora do formato é rejeitada e não sobrescreve o último dado bom", async () => {
  const bom = { t: 1700000000000, d: { avisos: ["bom"] } };
  const { Fontes, st } = ambiente({ resposta: () => ({ corpo: { outra: "coisa" } }), dados: { "cajamar:x": JSON.stringify(bom) } });
  const r = await Fontes.consultar("x", "http://a", ehLista);
  assert.equal(r.antigo, true);
  assert.equal(r.erro, "resposta em formato inesperado");
  assert.deepEqual(JSON.parse(st.getItem("cajamar:x")).d.avisos, ["bom"]);
});

test("guardar: falha de armazenamento é registrada (não silenciosa) e devolve false", () => {
  const { Fontes, avisos } = ambiente({ resposta: () => ({ corpo: {} }), opcoes: { falharSempre: true } });
  assert.equal(Fontes.guardar("z", { a: 1 }), false);
  assert.ok(avisos.some((a) => /não foi possível guardar/.test(a)));
});
