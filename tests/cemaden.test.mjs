// Testes da montagem dos dados do CEMADEN (worker/cemaden-proxy.js), usada pelo robô e pelo Worker.
// Os dados abaixo são FICTÍCIOS, criados só para testar o código.
import test from "node:test";
import assert from "node:assert/strict";
import worker, { montar, IBGE, buscarBruto, origemPermitida, mesclarPacotesSync } from "../worker/cemaden-proxy.js";
import { avaliarGatilhosAlerta, formatarMensagemTelegram } from "../scripts/alertas-telegram.mjs";

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

test("montar não falha quando todas as estações da rede estão sem data válida", () => {
  const semDatas = Array.from({ length: 55 }, (_, i) => estacao(3509205, "CAJAMAR", "Est " + i, ""));
  const r = montar(semDatas);
  assert.equal(r.referenciaRede, null);
  assert.equal(r.estacoes[0].minutosAntes, null);
});

test("origemPermitida aceita produção e qualquer porta localhost/127.0.0.1, mas bloqueia terceiros", () => {
  assert.equal(origemPermitida("https://theolindolfo02.github.io"), true);
  assert.equal(origemPermitida("https://cajamar-cemaden.theolindolfo02.workers.dev"), true);
  assert.equal(origemPermitida("http://localhost:8765"), true);
  assert.equal(origemPermitida("http://localhost:5173"), true);
  assert.equal(origemPermitida("http://127.0.0.1:8080"), true);
  assert.equal(origemPermitida("https://outro-site.exemplo.com"), false);
  assert.equal(origemPermitida(null), false);
});

test("Worker responde OPTIONS, GET, HEAD, rejeita POST (405) e trata falha da fonte (502)", async () => {
  const reqOpt = new Request("https://proxy.exemplo/", {
    method: "OPTIONS",
    headers: { Origin: "http://localhost:5500" }
  });
  const resOpt = await worker.fetch(reqOpt);
  assert.equal(resOpt.status, 204);
  assert.equal(resOpt.headers.get("Access-Control-Allow-Origin"), "http://localhost:5500");

  const reqPost = new Request("https://proxy.exemplo/", { method: "POST" });
  const resPost = await worker.fetch(reqPost);
  assert.equal(resPost.status, 405);

  const mockRede = rede([estacao(3509205, "CAJAMAR", "Jordanésia", "15/10/26 10:00", { acc24hr: 14.2 })]);
  const buscarOk = async () => ({ ok: true, json: async () => mockRede });

  const reqGet = new Request("https://proxy.exemplo/", {
    method: "GET",
    headers: { Origin: "https://theolindolfo02.github.io" }
  });
  const resGet = await worker.fetch(reqGet, { buscar: buscarOk });
  assert.equal(resGet.status, 200);
  assert.equal(resGet.headers.get("Access-Control-Allow-Origin"), "https://theolindolfo02.github.io");
  assert.ok(resGet.headers.get("Cache-Control").includes("stale-while-revalidate"));
  const corpo = await resGet.json();
  assert.equal(corpo.estacoes.length, 1);
  assert.equal(corpo.estacoes[0].acc.h24, 14.2);

  const reqHead = new Request("https://proxy.exemplo/", { method: "HEAD" });
  const resHead = await worker.fetch(reqHead, { buscar: buscarOk });
  assert.equal(resHead.status, 200);
  assert.equal(await resHead.text(), "");
});

test("2.6 Worker /sync: sincroniza e mescla ocorrências e observações entre dispositivos da equipe", async () => {
  const pacotePC = {
    dispositivo: "PC-Base",
    ocorrencias: [{ id: "oc1", tipo: "Incêndios", subtipo: "Vegetação", local: "Jordanésia", status: "aberta", quando: "2026-11-16T10:00:00Z", atualizadoEm: "2026-11-16T10:00:00Z" }],
    observacoes: [{ id: "ob1", local: "Polvilho", quando: "2026-11-16T09:00" }]
  };
  const reqPost1 = new Request("https://proxy.exemplo/sync?sala=equipe199", {
    method: "POST",
    headers: { Origin: "https://theolindolfo02.github.io", "Content-Type": "application/json" },
    body: JSON.stringify(pacotePC)
  });
  const res1 = await worker.fetch(reqPost1);
  assert.equal(res1.status, 200);
  const j1 = await res1.json();
  assert.equal(j1.ok, true);
  assert.equal(j1.dados.ocorrencias.length, 1);

  // Viatura atualiza status da oc1 e adiciona oc2
  const pacoteViatura = {
    dispositivo: "Viatura-01",
    ocorrencias: [
      { id: "oc1", tipo: "Incêndios", subtipo: "Vegetação", local: "Jordanésia", status: "concluida", quando: "2026-11-16T10:00:00Z", atualizadoEm: "2026-11-16T11:30:00Z" },
      { id: "oc2", tipo: "Ocorrências com Árvores", subtipo: "Poda", local: "Ponunduva", status: "aberta", quando: "2026-11-16T11:00:00Z", atualizadoEm: "2026-11-16T11:00:00Z" }
    ]
  };
  const reqPost2 = new Request("https://proxy.exemplo/sync?sala=equipe199", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pacoteViatura)
  });
  const res2 = await worker.fetch(reqPost2);
  const j2 = await res2.json();
  assert.equal(j2.dados.ocorrencias.length, 2);
  const oc1Atualizada = j2.dados.ocorrencias.find((x) => x.id === "oc1");
  assert.equal(oc1Atualizada.status, "concluida", "deve prevalecer a atualização mais recente da viatura");
  assert.equal(j2.dados.observacoes.length, 1, "preserva observações enviadas antes pelo PC");
});

test("2.7 Alertas automáticos (Telegram): avalia gatilhos de INMET, CEMADEN >= 20 mm/h e focos de calor em Cajamar", () => {
  const gatilhos = avaliarGatilhosAlerta({
    avisosInmet: [{ evento: "Tempestade", severidade: "Perigo", inicio: "16/11 14:00", fim: "16/11 21:00" }],
    cemaden: { estacoes: [{ ibge: 3509205, nome: "Jordanésia", leitura: "16/11/26 15:00", acc: { h1: 24.6, h24: 42.0 } }] },
    focosRecentes: [{ satelite: "GOES-19", lat: -23.35, lon: -46.87 }]
  });
  assert.equal(gatilhos.length, 3);
  const msg = formatarMensagemTelegram(gatilhos, "16/11/2026 15:05");
  assert.match(msg, /ALERTA AUTOMÁTICO — DEFESA CIVIL DE CAJAMAR/);
  assert.match(msg, /AVISO INMET/);
  assert.match(msg, /24,6 mm/);
  assert.match(msg, /GOES-19/);
});

test("Worker híbrido (com ASSETS): serve JSON em /cemaden e /data/cemaden.json, e delega páginas HTML para ASSETS", async () => {
  const mockRede = rede([estacao(3509205, "CAJAMAR", "Jordanésia", "15/10/26 10:00", { acc24hr: 9.8 })]);
  const env = {
    buscar: async () => ({ ok: true, json: async () => mockRede }),
    ASSETS: {
      fetch: async (req) => new Response("<html>index</html>", { status: 200, headers: { "Content-Type": "text/html" } })
    }
  };
  const resHtml = await worker.fetch(new Request("https://cajamar-cemaden.theolindolfo02.workers.dev/", { headers: { Accept: "text/html" } }), env);
  assert.equal(resHtml.status, 200);
  assert.match(await resHtml.text(), /<html>index<\/html>/);

  for (const rota of ["/cemaden", "/data/cemaden.json"]) {
    const resApi = await worker.fetch(new Request("https://cajamar-cemaden.theolindolfo02.workers.dev" + rota, {
      headers: { Origin: "https://cajamar-cemaden.theolindolfo02.workers.dev" }
    }), env);
    assert.equal(resApi.status, 200);
    const j = await resApi.json();
    assert.equal(j.estacoes[0].acc.h24, 9.8);
  }
});
