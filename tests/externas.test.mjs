// Testes da leitura do CGE (rota /cge do Worker) e da aba "Outras fontes".
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import worker, { lerPostoCge, POSTOS_CGE } from "../worker/cemaden-proxy.js";
import { carregarScript } from "./util.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(RAIZ, "tests/fixtures/cge-parnaiba.html"), "utf8");

test("lerPostoCge lê todos os campos da página real de Santana de Parnaíba", () => {
  const r = lerPostoCge(html);
  assert.deepEqual(r.chuva, { atual: 0, anterior: 5.4, zeramento: "10:00" });
  assert.deepEqual(r.temperatura, { atual: 25, max: 28.6, min: 16 });
  assert.deepEqual(r.umidade, { atual: 100, max: 100, min: 100 });
  assert.deepEqual(r.pressao, { atual: 933, max: 936.1, min: 930.5 });
  assert.deepEqual(r.vento, { direcao: "S", velocidade: 0.7, rajada: 7.4 });
});

test("lerPostoCge: posto sem vento deixa o vento sem dado (nunca zero) e valor absurdo vira null", () => {
  const semVento = html.replace(/Dire&ccedil;&atilde;o:[\s\S]*?Rajada:<\/strong><\/td><td[^>]*>[^<]*<\/td>/, "");
  const r = lerPostoCge(semVento);
  assert.equal(r.vento.velocidade, null);
  assert.equal(r.vento.direcao, null);
  const absurdo = html.replace("933.0 hPa", "9999.0 hPa");
  assert.equal(lerPostoCge(absurdo).pressao.atual, null);
});

test("lerPostoCge recusa página vazia ou de layout desconhecido", () => {
  assert.throws(() => lerPostoCge(""), /vazia|inesperado/);
  assert.throws(() => lerPostoCge("<html>" + "x".repeat(400) + "</html>"), /nenhuma medição/);
});

test("rota /cge: devolve JSON, só aceita postos da lista e informa que a hora da leitura não existe", async () => {
  const buscar = async (url) => { assert.match(url, /POSTO=1000880$/); return new Response(html, { status: 200 }); };
  const res = await worker.fetch(new Request("https://x.test/cge?posto=1000880", { headers: { Origin: "https://theolindolfo02.github.io" } }), { buscar });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://theolindolfo02.github.io");
  const j = await res.json();
  assert.equal(j.nome, POSTOS_CGE["1000880"]);
  assert.equal(j.horaDaLeituraInformada, false);
  assert.equal(j.temperatura.atual, 25);
  const ruim = await worker.fetch(new Request("https://x.test/cge?posto=999"), { buscar: async () => { throw new Error("não devia buscar"); } });
  assert.equal(ruim.status, 400);
  const fora = await worker.fetch(new Request("https://x.test/cge?posto=1000880"), { buscar: async () => new Response("erro", { status: 500 }) });
  assert.equal(fora.status, 502);
});

test("a rota padrão do Worker continua sendo o CEMADEN", async () => {
  let pedida = "";
  await worker.fetch(new Request("https://x.test/"), { buscar: async (u) => { pedida = u; return new Response("[]", { status: 200 }); } });
  assert.match(pedida, /cemaden/);
});

test("Externas.validar: arquivo ausente, posto ausente e posto lido", () => {
  const win = carregarScript("js/externas.js");
  assert.match(win.Externas.validar(null, "1000880"), /Ainda não há leitura/);
  assert.match(win.Externas.validar({ postos: {}, falhas: { 1000880: "HTTP 503" } }, "1000880"), /HTTP 503/);
  assert.equal(win.Externas.validar({ postos: { 1000880: {} } }, "1000880"), null);
  assert.equal(win.Externas.fmt(null, "mm"), "sem dado");
  assert.equal(win.Externas.fmt(5.4, "mm"), "5,4 mm");
});

test("robô do CGE: grava os postos lidos, tolera um posto com falha e recusa quando todos falham", async () => {
  const { coletar } = await import("../scripts/coletar-cge.mjs");
  const ok = await coletar({ buscar: async (u) => (u.endsWith("=504") ? new Response("x", { status: 503 }) : new Response(html, { status: 200 })) });
  assert.deepEqual(Object.keys(ok.postos).sort(), ["1000880", "515"]);
  assert.match(ok.falhas["504"], /503/);
  assert.equal(ok.horaDaLeituraInformada, false);
  assert.equal(ok.postos["1000880"].temperatura.atual, 25);
  await assert.rejects(coletar({ buscar: async () => new Response("x", { status: 503 }) }), /nenhum posto/);
});

test("segurança: nenhum arquivo do site contém chave de API (sequência longa em hexadecimal ou appid/apikey com valor)", () => {
  const achados = [];
  const ler = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".git" || e.name === "graphify-out" || e.name === "fixtures") continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) { ler(p); continue; }
      if (!/\.(js|mjs|html|json|md|css|yml)$/.test(e.name) || /^package-lock/.test(e.name)) continue;
      const txt = readFileSync(p, "utf8");
      if (/\b[a-f0-9]{32,}\b/i.test(txt.replace(/sha\d*-[A-Za-z0-9+/=]+/g, ""))) achados.push(p + " (hex longo)");
      if (/(appid|apikey|api_key|x-api-key)\s*[=:]\s*["']?[A-Za-z0-9]{16,}/i.test(txt)) achados.push(p + " (chave com valor)");
    }
  };
  ler(RAIZ);
  assert.deepEqual(achados, []);
});

test("PubTextos: edita qualquer texto da arte, guarda por modelo e nunca aplica edição a texto diferente", async () => {
  const mem = {}; const arm = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } };
  const win = carregarScript("js/publicar-textos.js");
  const pt = win.PubTextos.criar(arm);
  pt.iniciar("flyer_dia", ["Título do campo"]);
  assert.equal(pt.aplicar("DEFESA CIVIL DE CAJAMAR"), "DEFESA CIVIL DE CAJAMAR");
  assert.equal(pt.aplicar("Título do campo"), "Título do campo");          // já tem campo próprio: não entra na lista
  assert.equal(pt.aplicar("—"), "—");                                       // sem letra/número: não entra
  assert.equal(JSON.stringify(pt.vistos()), JSON.stringify(["DEFESA CIVIL DE CAJAMAR"]));
  assert.equal(pt.definir("DEFESA CIVIL DE CAJAMAR", "DEFESA CIVIL · CAJAMAR/SP"), true);
  pt.iniciar("flyer_dia", []);
  assert.equal(pt.aplicar("DEFESA CIVIL DE CAJAMAR"), "DEFESA CIVIL · CAJAMAR/SP");
  assert.equal(pt.aplicar("DEFESA CIVIL DE CAJAMAR "), "DEFESA CIVIL DE CAJAMAR ");  // texto diferente: não aplica
  // outro modelo de panfleto não herda a edição
  pt.iniciar("flyer_fogo", []);
  assert.equal(pt.aplicar("DEFESA CIVIL DE CAJAMAR"), "DEFESA CIVIL DE CAJAMAR");
  // persistência: um núcleo novo lê o que foi gravado
  const pt2 = win.PubTextos.criar(arm); pt2.iniciar("flyer_dia", []);
  assert.equal(pt2.aplicar("DEFESA CIVIL DE CAJAMAR"), "DEFESA CIVIL · CAJAMAR/SP");
  // edição sem uso (o texto original não apareceu neste desenho) é listada e pode ser descartada
  pt2.iniciar("flyer_dia", []); pt2.aplicar("outro texto");
  assert.equal(JSON.stringify(pt2.semUso()), JSON.stringify(["DEFESA CIVIL DE CAJAMAR"]));
  pt2.descartarSemUso(); assert.equal(pt2.total(), 0);
  // vazio ou igual ao original remove a edição
  pt2.definir("x1", "y"); assert.equal(pt2.total(), 1); pt2.definir("x1", ""); assert.equal(pt2.total(), 0);
});
