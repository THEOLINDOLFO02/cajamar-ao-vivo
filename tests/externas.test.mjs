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

test("Externas.validar avisa quando o Worker publicado é antigo (devolve o JSON do CEMADEN)", () => {
  const win = carregarScript("js/externas.js");
  assert.match(win.Externas.validar({ estacoes: [], coletadoEm: "x" }), /rota \/cge/);
  assert.match(win.Externas.validar({ erro: "HTTP 500" }), /não respondeu/);
  assert.equal(win.Externas.validar({ posto: "1", temperatura: {}, chuva: {} }), null);
  assert.equal(win.Externas.fmt(null, "mm"), "sem dado");
  assert.equal(win.Externas.fmt(5.4, "mm"), "5,4 mm");
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
