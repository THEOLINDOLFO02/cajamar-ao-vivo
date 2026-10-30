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
    "painel.js": ["fontes.js", "geo.js", "inmet.js", "municipio.js", "ar.js", "modelos.js", "climatologia.js", "cemaden.js", "estacao.js", "queimadas.js", "deslizamento.js", "config.js", "painel-base.js", "painel-deslizamento.js", "painel-fogo.js", "painel-mapa.js", "painel-clima.js"],
    // os módulos do painel dependem do painel-base.js (cria window.Painel) e das bibliotecas de dados
    "painel-base.js": ["fontes.js"],
    "painel-deslizamento.js": ["painel-base.js", "deslizamento.js", "estacao.js"],
    "painel-fogo.js": ["painel-base.js", "queimadas.js"],
    "painel-mapa.js": ["painel-base.js", "geo.js", "municipio.js"],
    "painel-clima.js": ["painel-base.js", "inmet.js"],
    "municipio.js": ["fontes.js", "geo.js"],
    "ar.js": ["fontes.js"],
    "modelos.js": ["fontes.js"],
    "windy.js": ["fontes.js", "config.js"],
    "climatologia.js": ["fontes.js"],
    "publicar.js": ["fontes.js", "inmet.js", "estacao.js", "queimadas.js", "deslizamento.js", "publicacao.js"],
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

test("aritmética dos limiares REFERENCIAIS (não homologados; não prova validade científica) mantém os 5 níveis", async () => {
  const { carregarScript } = await import("./util.mjs");
  const win = carregarScript("js/deslizamento.js");
  const D = win.Deslizamento;
  assert.ok(D && Array.isArray(D.ESTADOS) && D.ESTADOS.length === 5);

  // Normalidade: < 10 mm/h, < 25 mm/24h, < 50 mm/168h
  assert.equal(D.avaliarRisco({ mm1h: 5, mm24h: 12, mm168h: 30 }).id, "referencial_0");

  // Observação: 10 a 20 mm/h, 25 a 50 mm/24h, 50 a 100 mm/168h
  assert.equal(D.avaliarRisco({ mm1h: 15, mm24h: 10, mm168h: 20 }).id, "referencial_1");
  assert.equal(D.avaliarRisco({ mm1h: 2, mm24h: 35, mm168h: 40 }).id, "referencial_1");
  assert.equal(D.avaliarRisco({ mm1h: 2, mm24h: 10, mm168h: 75 }).id, "referencial_1");

  // Atenção: 20 a 30 mm/h, 50 a 100 mm/24h, 100 a 150 mm/168h
  assert.equal(D.avaliarRisco({ mm1h: 25, mm24h: 20, mm168h: 30 }).id, "referencial_2");
  assert.equal(D.avaliarRisco({ mm1h: 5, mm24h: 70, mm168h: 80 }).id, "referencial_2");
  assert.equal(D.avaliarRisco({ mm1h: 5, mm24h: 20, mm168h: 125 }).id, "referencial_2");

  // Alerta: 30 a 50 mm/h, 100 a 150 mm/24h, 150 a 210 mm/168h (e 40 a 80 mm/h combinado)
  assert.equal(D.avaliarRisco({ mm1h: 38, mm24h: 40, mm168h: 60 }).id, "referencial_3");
  assert.equal(D.avaliarRisco({ mm1h: 10, mm24h: 120, mm168h: 130 }).id, "referencial_3");
  assert.equal(D.avaliarRisco({ mm1h: 45, mm24h: 60, mm168h: 175 }).id, "referencial_3");

  // Alerta Máximo: > 50 mm/h, > 150 mm/24h, > 210 mm/168h (e > 80 mm/h)
  assert.equal(D.avaliarRisco({ mm1h: 55, mm24h: 60, mm168h: 70 }).id, "referencial_4");
  assert.equal(D.avaliarRisco({ mm1h: 15, mm24h: 160, mm168h: 180 }).id, "referencial_4");
  assert.equal(D.avaliarRisco({ mm1h: 10, mm24h: 40, mm168h: 225 }).id, "referencial_4");
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
  mem.setItem("cajamar:observacoes:v1", JSON.stringify([{ id: "ob1", local: "Jordanésia", quando: "2026-01-02T10:00", chuvaMm: null, ventoKmh: null }]));

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

test("toda página tem a mesma estrutura: atalho de pular, cabeçalho e menu antes do <main>, um só <h1>", () => {
  for (const p of paginas) {
    const html = readFileSync(join(RAIZ, p), "utf8");
    const iPular = html.indexOf('class="pular"'), iHeader = html.indexOf('class="topo"'), iNav = html.indexOf('class="nav-bar"'), iMain = html.indexOf('<main');
    assert.ok(iPular > -1 && iHeader > iPular && iNav > iHeader && iMain > iNav, `${p}: ordem esperada: atalho de pular, cabeçalho, menu, main`);
    assert.match(html, /<main[^>]*id="conteudo"/, `${p}: o <main> precisa de id="conteudo" (destino do atalho de pular)`);
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, `${p}: deve ter exatamente um <h1>`);
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1, `${p}: o menu deve marcar exatamente uma página atual`);
  }
});

test("os elementos que cada script procura pelo id existem na página dele", () => {
  const pares = { "painel.js": "index.html", "painel-base.js": "index.html", "painel-deslizamento.js": "index.html", "painel-fogo.js": "index.html", "painel-mapa.js": "index.html", "painel-clima.js": "index.html", "quadro.js": "quadro.html", "observacoes.js": "observacoes.html", "historico.js": "historico.html", "comparar.js": "comparar.html", "publicar.js": "publicar.html" };
  // ids criados pelo próprio script (não precisam estar no HTML)
  const criadosPeloJs = /\.id\s*=\s*["']([^"']+)["']|\bid=\\?"([^"\\]+)\\?"/g;
  for (const [js, pagina] of Object.entries(pares)) {
    const codigo = readFileSync(join(RAIZ, "js", js), "utf8");
    const html = readFileSync(join(RAIZ, pagina), "utf8");
    const dinamicos = new Set([...codigo.matchAll(criadosPeloJs)].map((m) => m[1] || m[2]));
    const usados = new Set([...codigo.matchAll(/\$\("([A-Za-z0-9_-]+)"\)/g)].map((m) => m[1]));
    for (const id of usados) {
      if (dinamicos.has(id)) continue;
      assert.ok(html.includes(`id="${id}"`), `${js} procura #${id}, que não existe em ${pagina}`);
    }
  }
});

test("Fontes.guardar protege dados operacionais do usuário quando o localStorage atinge o limite de quota", async () => {
  const { carregarScript } = await import("./util.mjs");
  const win = carregarScript("js/fontes.js");
  const dados = {
    "cajamar:ocorrencias:v1": JSON.stringify([{ id: "1", tipo: "Alagamento" }]),
    "cajamar:clima": JSON.stringify({ t: 1000, d: { old: true } }),
    "cajamar:modelos": JSON.stringify({ t: 2000, d: { old: true } })
  };
  let falharPrimeiraVez = true;
  win.localStorage = {
    get length() { return Object.keys(dados).length; },
    key(i) { return Object.keys(dados)[i] || null; },
    getItem(k) { return dados[k] || null; },
    setItem(k, v) {
      if (falharPrimeiraVez) {
        falharPrimeiraVez = false;
        throw new Error("QuotaExceededError");
      }
      dados[k] = String(v);
    },
    removeItem(k) { delete dados[k]; }
  };

  win.Fontes.guardar("avisos_inmet", { avisos: [1, 2, 3] });
  assert.ok(dados["cajamar:ocorrencias:v1"], "nunca deve apagar ocorrências do usuário para liberar espaço de cache");
  assert.equal(dados["cajamar:clima"], undefined, "deve remover o cache de API mais antigo para abrir espaço");
  assert.deepEqual(JSON.parse(JSON.stringify(win.Fontes.lerGuardado("avisos_inmet").d)), { avisos: [1, 2, 3] });
});

// ---- Histórico: nomes das colunas, aviso obrigatório e regressões da auditoria ----
test("historico.html: colunas distinguem dia civil, 60 min, 24 h e 168 h móveis e mostram cobertura", () => {
  const html = readFileSync(join(RAIZ, "historico.html"), "utf8");
  for (const col of ["Chuva do dia civil (mm)", "Máx. em 60 min (mm)", "Acum. móvel 24 h (mm)", "Acum. móvel 168 h (mm)", "Cobertura", "Indicador referencial"]) {
    assert.ok(html.includes(col), "coluna ausente: " + col);
  }
  assert.ok(!html.includes("<th>Chuva 24h</th>"), "o dia civil não pode mais se chamar 24h");
  assert.ok(!html.includes("<th>Acum. 168h (7d)</th>"));
  assert.match(html, /Atenção &lt; Alerta &lt; Transbordamento/);
  assert.match(html, /validação técnica para o ponto de medição/);
});

test("aviso de indicadores de referência aparece no painel e no histórico", () => {
  const frase = "Indicadores pluviométricos de referência. Não substituem vistoria técnica, avaliação de campo ou decisão da autoridade competente.";
  for (const pg of ["index.html", "historico.html"]) {
    assert.ok(readFileSync(join(RAIZ, pg), "utf8").includes(frase), pg + " sem o aviso obrigatório");
  }
});

test("regressão: estacao.js e historico.js não engolem erros em catch vazio nem usam o limite fixo de 1296 leituras", () => {
  for (const arq of ["js/estacao.js", "js/historico.js"]) {
    const src = readFileSync(join(RAIZ, arq), "utf8");
    assert.doesNotMatch(src, /catch\s*\(\s*\w+\s*\)\s*\{\s*\}/, arq + " tem catch vazio");
    assert.doesNotMatch(src, /\.n\s*<\s*1296/, arq + " ainda usa n < 1296 para decidir dia completo");
    assert.doesNotMatch(src, /parseFloat\([^)]*\)\s*\|\|\s*\d/, arq + " troca valor inválido por padrão com ||");
  }
});

test("páginas que usam janelas de estação carregam estacao.js antes de deslizamento.js", () => {
  for (const pg of ["index.html", "historico.html", "quadro.html", "publicar.html"]) {
    const html = readFileSync(join(RAIZ, pg), "utf8");
    const a = html.indexOf("js/estacao.js"), b = html.indexOf("js/deslizamento.js");
    assert.ok(a > -1 && b > a, pg + ": estacao.js deve vir antes de deslizamento.js");
  }
});
