// Verificações de integridade do site: sintaxe dos scripts, arquivos referenciados e cache do aplicativo.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { Script } from "node:vm";
import { join } from "node:path";
import { RAIZ } from "./util.mjs";

const paginas = readdirSync(RAIZ).filter((f) => f.endsWith(".html"));
const scripts = readdirSync(join(RAIZ, "js")).filter((f) => f.endsWith(".js"));

test("todo script de js/ tem sintaxe válida", () => {
  for (const f of scripts) {
    assert.doesNotThrow(() => new Script(readFileSync(join(RAIZ, "js", f), "utf8"), { filename: "js/" + f }), "erro de sintaxe em js/" + f);
  }
  assert.doesNotThrow(() => new Script(readFileSync(join(RAIZ, "sw.js"), "utf8"), { filename: "sw.js" }), "erro de sintaxe em sw.js");
});

function locais(html) {
  const refs = [];
  for (const m of html.matchAll(/\b(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
    const r = m[1];
    if (/^(https?:|mailto:|data:|tel:)/.test(r)) continue;
    refs.push(r);
  }
  return refs;
}

test("toda página só referencia arquivos que existem", () => {
  for (const p of paginas) {
    for (const r of locais(readFileSync(join(RAIZ, p), "utf8"))) {
      assert.ok(existsSync(join(RAIZ, r)), `${p} referencia "${r}", que não existe`);
    }
  }
});

test("toda página carrega o menu completo e cada link do menu leva a uma página existente", () => {
  for (const p of paginas) {
    const html = readFileSync(join(RAIZ, p), "utf8");
    const nav = /<nav class="nav-bar"[\s\S]*?<\/nav>/.exec(html);
    assert.ok(nav, `${p} não tem o menu de navegação`);
    for (const m of nav[0].matchAll(/href="([^"]+)"/g)) assert.ok(existsSync(join(RAIZ, m[1])), `${p}: menu aponta para "${m[1]}", que não existe`);
    assert.equal([...nav[0].matchAll(/href=/g)].length, paginas.length, `${p}: o menu deveria ter um link para cada página (${paginas.length})`);
  }
});

test("scripts usados por uma página são carregados antes de quem depende deles", () => {
  const ordem = {
    "painel.js": ["fontes.js", "inmet.js", "cemaden.js", "estacao.js", "queimadas.js", "deslizamento.js", "config.js"],
    "publicar.js": ["fontes.js", "inmet.js", "estacao.js", "queimadas.js", "deslizamento.js"],
    "historico.js": ["estacao.js", "deslizamento.js"],
    "quadro.js": ["estacao.js", "deslizamento.js"],
    "observacoes.js": ["deslizamento.js"],
    "comparar.js": ["estacao.js"],
    "cemaden.js": ["fontes.js"]
  };
  for (const p of paginas) {
    const srcs = [...readFileSync(join(RAIZ, p), "utf8").matchAll(/<script src="js\/([^"]+)"/g)].map((m) => m[1]);
    for (const [quem, precisa] of Object.entries(ordem)) {
      if (!srcs.includes(quem)) continue;
      for (const dep of precisa) {
        assert.ok(srcs.includes(dep) && srcs.indexOf(dep) < srcs.indexOf(quem), `${p}: ${dep} deve ser carregado antes de ${quem}`);
      }
    }
  }
});

test("o cache do aplicativo (sw.js) lista só arquivos que existem e inclui todas as páginas", () => {
  const sw = readFileSync(join(RAIZ, "sw.js"), "utf8");
  const lista = /RECURSOS_BASE\s*=\s*\[([\s\S]*?)\]/.exec(sw)[1];
  const arquivos = [...lista.matchAll(/"\.\/([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
  for (const a of arquivos) assert.ok(existsSync(join(RAIZ, a)), `sw.js lista "${a}", que não existe`);
  for (const p of paginas) assert.ok(arquivos.includes(p), `sw.js deveria guardar ${p} no cache`);
});

test("o manifest aponta para ícone existente", () => {
  const m = JSON.parse(readFileSync(join(RAIZ, "manifest.json"), "utf8"));
  for (const i of m.icons) assert.ok(existsSync(join(RAIZ, i.src)), `ícone ${i.src} não existe`);
});

test("config.js não contém chaves ou senhas", () => {
  const c = readFileSync(join(RAIZ, "js", "config.js"), "utf8");
  assert.doesNotMatch(c, /(api[_-]?key|secret|token|senha|password)\s*[:=]/i);
});

test("critérios de risco de deslizamento (Pinheiro et al., 2005; AlertaRio, 2013) classificam corretamente os 5 níveis", async () => {
  const { carregarScript } = await import("./util.mjs");
  const win = carregarScript("js/deslizamento.js");
  const D = win.Deslizamento;
  assert.ok(D && Array.isArray(D.ESTADOS) && D.ESTADOS.length === 5);

  // Normalidade: < 10 mm/h, < 25 mm/24h, < 50 mm/168h
  assert.equal(D.avaliarRisco({ mm1h: 5, mm24h: 12, mm168h: 30 }).id, "normalidade");

  // Observação: 10 a 20 mm/h, 25 a 50 mm/24h, 50 a 100 mm/168h
  assert.equal(D.avaliarRisco({ mm1h: 15, mm24h: 10, mm168h: 20 }).id, "observacao");
  assert.equal(D.avaliarRisco({ mm1h: 2, mm24h: 35, mm168h: 40 }).id, "observacao");
  assert.equal(D.avaliarRisco({ mm1h: 2, mm24h: 10, mm168h: 75 }).id, "observacao");

  // Atenção: 20 a 30 mm/h, 50 a 100 mm/24h, 100 a 150 mm/168h
  assert.equal(D.avaliarRisco({ mm1h: 25, mm24h: 20, mm168h: 30 }).id, "atencao");
  assert.equal(D.avaliarRisco({ mm1h: 5, mm24h: 70, mm168h: 80 }).id, "atencao");
  assert.equal(D.avaliarRisco({ mm1h: 5, mm24h: 20, mm168h: 125 }).id, "atencao");

  // Alerta: 30 a 50 mm/h, 100 a 150 mm/24h, 150 a 210 mm/168h (e 40 a 80 mm/h combinado)
  assert.equal(D.avaliarRisco({ mm1h: 38, mm24h: 40, mm168h: 60 }).id, "alerta");
  assert.equal(D.avaliarRisco({ mm1h: 10, mm24h: 120, mm168h: 130 }).id, "alerta");
  assert.equal(D.avaliarRisco({ mm1h: 45, mm24h: 60, mm168h: 175 }).id, "alerta");

  // Alerta Máximo: > 50 mm/h, > 150 mm/24h, > 210 mm/168h (e > 80 mm/h)
  assert.equal(D.avaliarRisco({ mm1h: 55, mm24h: 60, mm168h: 70 }).id, "alerta_maximo");
  assert.equal(D.avaliarRisco({ mm1h: 15, mm24h: 160, mm168h: 180 }).id, "alerta_maximo");
  assert.equal(D.avaliarRisco({ mm1h: 10, mm24h: 40, mm168h: 225 }).id, "alerta_maximo");
});

test("Estacao.avaliarNivelRio e backup completo funcionam corretamente", async () => {
  const { carregarScript } = await import("./util.mjs");
  const win = carregarScript("js/estacao.js");
  const E = win.Estacao;
  const cotas = { atencaoM: 1.80, alertaM: 2.30, transbordoM: 2.80, deltaAtencaoCm: 35, deltaAlertaCm: 60 };

  assert.equal(E.avaliarNivelRio(1.20, 0.10, cotas).id, "normal");
  assert.equal(E.avaliarNivelRio(1.90, 0.10, cotas).id, "atencao");
  assert.equal(E.avaliarNivelRio(1.40, 0.40, cotas).id, "atencao"); // subida rápida Δ 40 cm
  assert.equal(E.avaliarNivelRio(2.45, 0.20, cotas).id, "alerta");
  assert.equal(E.avaliarNivelRio(2.90, 0.30, cotas).id, "transbordo");

  // Teste de backup completo em memória
  const mem = {
    dados: {},
    getItem(k) { return this.dados[k] || null; },
    setItem(k, v) { this.dados[k] = String(v); },
    removeItem(k) { delete this.dados[k]; }
  };
  E.salvarCotasRio({ atencaoM: 1.95, alertaM: 2.40, transbordoM: 3.00 }, mem);
  mem.setItem("cajamar:ocorrencias:v1", JSON.stringify([{ id: "oc1", tipo: "Incêndios" }]));
  mem.setItem("cajamar:observacoes:v1", JSON.stringify([{ id: "ob1", local: "Jordanésia" }]));

  const bkp = E.gerarBackupCompleto(mem);
  assert.equal(bkp.cotasRio.atencaoM, 1.95);
  assert.equal(bkp.ocorrencias.length, 1);
  assert.equal(bkp.observacoes.length, 1);

  const memDestino = {
    dados: {},
    getItem(k) { return this.dados[k] || null; },
    setItem(k, v) { this.dados[k] = String(v); },
    removeItem(k) { delete this.dados[k]; }
  };
  const r = E.restaurarBackupCompleto(JSON.stringify(bkp), memDestino);
  assert.equal(r.ocorrenciasNovas, 1);
  assert.equal(r.observacoesNovas, 1);
  assert.equal(E.carregarCotasRio(memDestino).atencaoM, 1.95);
});
