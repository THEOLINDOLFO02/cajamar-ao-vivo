// Testes da montagem dos dados do CEMADEN (worker/cemaden-proxy.js), usada pelo robô e pelo Worker.
// Os dados abaixo são FICTÍCIOS, criados só para testar o código.
import test from "node:test";
import assert from "node:assert/strict";
import { montar, IBGE } from "../worker/cemaden-proxy.js";

function estacao(ibge, cidade, nome, leitura, extra) {
  return Object.assign({
    idestacao: Math.floor(Math.random() * 1e6), uf: "SP", codibge: ibge, cidade, nomeestacao: nome,
    ultimovalor: 0, datahoraUltimovalor: leitura, acc1hr: "-", acc3hr: "-", acc6hr: "-", acc12hr: "-",
    acc24hr: "-", acc48hr: "-", acc72hr: "-", acc96hr: "-", tipoestacao: 1, status: 0
  }, extra);
}
// Rede com 60 estações de outros municípios (o código exige uma resposta de tamanho razoável) + as de teste.
function rede(extras) {
  const base = [];
  for (let i = 0; i < 60; i++) base.push(estacao(3550308, "SÃO PAULO", "Fundo " + i, "15/10/26 10:00"));
  return base.concat(extras);
}

test("filtra só os municípios da lista e coloca Cajamar primeiro", () => {
  const r = montar(rede([
    estacao(3516408, "FRANCO DA ROCHA", "Z", "15/10/26 10:00"),
    estacao(3509205, "CAJAMAR", "Ponunduva", "15/10/26 09:00")
  ]));
  assert.equal(r.estacoes.length, 2);
  assert.equal(r.estacoes[0].cidade, "CAJAMAR");
  assert.ok(IBGE.includes(r.estacoes[1].ibge));
});

test('"-" vira null (sem dado), nunca zero', () => {
  const r = montar(rede([estacao(3509205, "CAJAMAR", "A", "15/10/26 09:00", { acc24hr: "-", acc72hr: 12.5, acc1hr: 0 })]));
  const e = r.estacoes[0];
  assert.equal(e.acc.h24, null);
  assert.equal(e.acc.h72, 12.5);
  assert.equal(e.acc.h1, 0, "zero verdadeiro continua sendo zero");
});

test("aceita número como texto com vírgula", () => {
  const r = montar(rede([estacao(3509205, "CAJAMAR", "A", "15/10/26 09:00", { acc24hr: "3,4" })]));
  assert.equal(r.estacoes[0].acc.h24, 3.4);
});

test("defasagem é calculada em relação à leitura mais recente da rede", () => {
  const r = montar(rede([
    estacao(3509205, "CAJAMAR", "Recente", "15/10/26 10:00"),
    estacao(3509205, "CAJAMAR", "Atrasada", "15/10/26 08:30"),
    estacao(3509205, "CAJAMAR", "Antiga", "09/07/24 16:40")
  ]));
  const por = Object.fromEntries(r.estacoes.map((e) => [e.nome, e.minutosAntes]));
  assert.equal(r.referenciaRede, "15/10/26 10:00");
  assert.equal(por.Recente, 0);
  assert.equal(por.Atrasada, 90);
  assert.ok(por.Antiga > 60 * 24 * 365, "estação parada há mais de um ano");
});

test("data inválida não derruba: defasagem fica null", () => {
  const r = montar(rede([estacao(3509205, "CAJAMAR", "Sem data", "")]));
  assert.equal(r.estacoes[0].minutosAntes, null);
});

test("resposta em formato inesperado é rejeitada (para não publicar lixo)", () => {
  assert.throws(() => montar({ erro: "x" }), /formato inesperado/);
  assert.throws(() => montar([]), /formato inesperado/);
  assert.throws(() => montar(Array(10).fill(estacao(1, "X", "Y", "15/10/26 10:00"))), /formato inesperado/);
});

test("devolve os campos que o painel usa", () => {
  const r = montar(rede([estacao(3509205, "CAJAMAR", "A", "15/10/26 09:00")]), new Date("2026-10-15T12:00:00Z"));
  assert.equal(r.coletadoEm, "2026-10-15T12:00:00.000Z");
  assert.ok(r.fonte.startsWith("https://"));
  assert.deepEqual(Object.keys(r.estacoes[0].acc), ["h1", "h3", "h6", "h12", "h24", "h48", "h72", "h96"]);
});

// ---------- buscarBruto: tentativas e limite de tempo ----------
import { buscarBruto } from "../worker/cemaden-proxy.js";
const semEspera = () => Promise.resolve();

test("buscarBruto tenta de novo após falha e devolve o JSON", async () => {
  let n = 0;
  const buscar = async () => (++n < 3 ? { ok: false, status: 503 } : { ok: true, json: async () => [1, 2] });
  assert.deepEqual(await buscarBruto({ buscar, dormir: semEspera }), [1, 2]);
  assert.equal(n, 3);
});

test("buscarBruto desiste após as tentativas e informa o motivo", async () => {
  let n = 0;
  const buscar = async () => { n++; return { ok: false, status: 500 }; };
  await assert.rejects(buscarBruto({ buscar, tentativas: 2, dormir: semEspera }), /HTTP 500/);
  assert.equal(n, 2);
});

test("buscarBruto aborta quando o CEMADEN não responde a tempo", async () => {
  const buscar = (url, { signal }) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(Object.assign(new Error("x"), { name: "AbortError" }))));
  await assert.rejects(buscarBruto({ buscar, tentativas: 1, timeoutMs: 20 }), /não respondeu/);
});
