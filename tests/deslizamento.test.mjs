// Fase 0 (segurança operacional): dado ausente, janelas incompletas, observações manuais e ausência de recomendações
// automáticas de evacuação/interdição. Estes testes verificam COMPORTAMENTO e RÓTULOS; não validam cientificamente
// os limiares (que seguem referenciais e não homologados pela Defesa Civil de Cajamar).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { carregarScripts, RAIZ } from "./util.mjs";
import { gerarCsvChuva } from "./auxiliares.mjs";

const ctx = carregarScripts(["js/estacao.js", "js/deslizamento.js"]);
const D = ctx.Deslizamento;
const E = ctx.Estacao;
const diasDe = (csv) => E.resumir(E.lerCsv(csv));

test("dado ausente permanece ausente e nunca vira normalidade", () => {
  for (const entrada of [undefined, {}, { mm1h: null, mm24h: null, mm168h: null }, { mm1h: "", mm24h: "", mm168h: "" }, { mm1h: "abc", mm24h: -3, mm168h: NaN }]) {
    const av = D.avaliarRisco(entrada);
    assert.equal(av.nivel, null);
    assert.equal(av.conclusivo, false);
    assert.equal(av.semDados, true);
    assert.equal(av.estado, "Dados insuficientes");
    assert.equal(av.codigo, "SEM_DADOS_SUFICIENTES");
    assert.equal(av.mm1h, null);
    assert.equal(av.mm24h, null);
    assert.equal(av.mm168h, null);
    assert.notEqual(av.icone, "🟢");
  }
  assert.equal(D.classificarPor1h(null), null);
  assert.equal(D.classificarPor24h(undefined), null);
  assert.equal(D.classificarPor168h("", 50), null);
});

test("0 mm medido é diferente de dado ausente", () => {
  const av = D.avaliarRisco({ mm1h: 0, mm24h: 0, mm168h: 0 });
  assert.equal(av.conclusivo, true);
  assert.equal(av.nivel, 0);
  assert.equal(av.mm1h, 0);
  assert.equal(D.classificarPor1h(0), 0);
  assert.equal(D.fmtMm(0), "0,0");
  assert.equal(D.fmtMm(null), "—");
});

test("com uma ou duas janelas só há indicador isolado, não conclusivo", () => {
  const av = D.avaliarRisco({ mm1h: 60 });
  assert.equal(av.conclusivo, false);
  assert.equal(av.nivel, null);
  assert.equal(av.nivel1h, 4);
  assert.deepEqual(Array.from(av.janelasSemDado), ["24h", "168h"]);
  assert.ok(av.gatilhos.some((g) => /isolado.*não conclusivo/.test(g)));
});

test("168h incompleta (1 dia ausente) → SEM_DADOS_SUFICIENTES com motivo; nunca normalidade", () => {
  const omit = new Set(Array.from({ length: 288 }, (_, k) => 288 * 2 + k));
  const dias = diasDe(gerarCsvChuva({ inicio: "2026-01-01", omitir: (k) => omit.has(k) }));
  const av = D.avaliarDiaEstacao(dias, "2026-01-07", "Estação X");
  assert.equal(av.conclusivo, false);
  assert.equal(av.codigo, "SEM_DADOS_SUFICIENTES");
  assert.equal(av.mm168h, null);
  assert.equal(av.parcial.mm168h, 172.8, "soma parcial só como mínimo informativo");
  assert.equal(av.estado, "Dados insuficientes");
  assert.notEqual(av.id, "referencial_0");
  assert.notEqual(av.icone, "🟢");
  assert.match(av.motivoIndisponibilidade, /168 h/);
  assert.match(av.motivoIndisponibilidade, /24 de 168 hora/);
  assert.equal(av.nivel24h, 1, "janelas completas continuam sendo mostradas como indicador isolado");
});

test("7 dias completos com cobertura geram o indicador referencial e registram a cobertura", () => {
  const dias = diasDe(gerarCsvChuva({ inicio: "2026-01-01", chuva: () => "0,3" }));
  const av = D.avaliarDiaEstacao(dias, "2026-01-07", "E");
  assert.equal(av.conclusivo, true);
  assert.equal(av.codigo, "OK");
  assert.equal(av.mm24h, 86.4);
  assert.equal(av.mm168h, 604.8);
  assert.equal(av.nivel, 4);
  assert.equal(av.janelas.mov168.horasComDado, 168);
  assert.equal(av.janelas.mov168.leituras, 2016);
  assert.match(av.fonte, /janela até 24:00/);
  assert.equal(av.criterioOficial, false);
  assert.match(av.aviso, /Não substituem vistoria técnica/);
});

test("dia legado (sem detalhe horário) e dia civil não são usados como 24h/168h", () => {
  const legado = D.avaliarDiaEstacao({ "2026-01-07": { n: 1440, chuva: 80, c60: 5 } }, "2026-01-07", "E");
  assert.equal(legado.conclusivo, false);
  assert.equal(legado.mm24h, null);
  assert.match(legado.motivoIndisponibilidade, /reimporte o CSV/);
  assert.equal(D.avaliarDiaEstacao({}, "2026-01-07", "E"), null);
});

test("sem o módulo de estações a avaliação diária é inconclusiva, não normal", () => {
  const so = carregarScripts(["js/deslizamento.js"]).Deslizamento;
  const av = so.avaliarDiaEstacao({ "2026-01-07": { n: 1 } }, "2026-01-07", "E");
  assert.equal(av.conclusivo, false);
  assert.match(av.motivoIndisponibilidade, /indisponível/);
});

test("série horária: horas ausentes não viram 0 e previsão é separada da estimativa do modelo", () => {
  const n = 24 * 9;
  const time = [], precipitation = [];
  for (let i = 0; i < n; i++) {
    const dt = new Date(Date.UTC(2026, 0, 1, 0, 0) + i * 3600000);
    time.push(dt.toISOString().slice(0, 13) + ":00");
    precipitation.push(1);
  }
  const agora = time[24 * 7 + 5];
  const completa = D.extrairDeSerieHoraria({ time, precipitation }, agora);
  assert.equal(completa.atual.conclusivo, true);
  assert.equal(completa.atual.tipoDado, "modelo");
  assert.match(completa.atual.fonte, /não é medição/);
  assert.equal(completa.projecao24h.tipoDado, "previsao");
  assert.match(completa.projecao24h.fonte, /Previsão/);

  const furos = precipitation.slice();
  furos[24 * 7 + 3] = null;
  const incompleta = D.extrairDeSerieHoraria({ time, precipitation: furos }, agora);
  assert.equal(incompleta.atual.conclusivo, false);
  assert.equal(incompleta.atual.mm24h, null);
  assert.equal(incompleta.atual.parcial.mm24h, 23);

  const semHora = D.extrairDeSerieHoraria({ time, precipitation }, "2030-01-01T00:00");
  assert.equal(semHora.atual.conclusivo, false);
});

test("observação manual vale só para a janela declarada", () => {
  const base = { local: "Jordanésia", quando: "2026-03-10T12:00" };
  const so1h = D.avaliarObservacaoManual({ ...base, chuvaMm: 35, janela: "1 h" }, [{ ...base, chuvaMm: 35, janela: "1 h" }]);
  assert.equal(so1h.mm1h, 35);
  assert.equal(so1h.mm24h, null);
  assert.equal(so1h.mm168h, null);
  assert.equal(so1h.conclusivo, false);
  assert.equal(so1h.nivel, null);
  assert.equal(so1h.nivel1h, 3);

  const so24h = D.avaliarObservacaoManual({ ...base, chuvaMm: 120, janela: "24 h" }, [{ ...base, chuvaMm: 120, janela: "24 h" }]);
  assert.equal(so24h.mm1h, null);
  assert.equal(so24h.mm168h, null);
  assert.equal(so24h.conclusivo, false);

  assert.equal(D.avaliarObservacaoManual({ ...base, chuvaMm: 10, janela: "" }, []), null);
  assert.equal(D.avaliarObservacaoManual({ ...base, chuvaMm: null, janela: "1 h" }, []), null);
});

test("observações de janelas distintas do mesmo local completam o indicador sem somar nem copiar", () => {
  const loc = "Polvilho";
  const rs = [
    { local: loc, quando: "2026-03-10T11:40", chuvaMm: 12, janela: "1 h" },
    { local: loc, quando: "2026-03-10T09:00", chuvaMm: 30, janela: "24 h" },
    { local: loc, quando: "2026-03-08T09:00", chuvaMm: 60, janela: "168 h" },
    { local: "Outro", quando: "2026-03-10T11:50", chuvaMm: 99, janela: "1 h" },
    { local: loc, quando: "2026-03-10T11:50", chuvaMm: 2, janela: "24 h" }
  ];
  const av = D.avaliarObservacaoManual(rs[0], rs);
  assert.equal(av.mm1h, 12);
  assert.equal(av.mm24h, 30); // o 24 h de 11:50 é posterior à referência; as janelas não são somadas
  assert.equal(av.mm168h, 60);
  assert.equal(av.conclusivo, true);
  assert.equal(av.nivel, 1);

  // leitura de 24 h mais antiga que 24 h da referência fica fora
  const antigas = [rs[0], { local: loc, quando: "2026-03-09T09:00", chuvaMm: 30, janela: "24 h" }, rs[2]];
  assert.equal(D.avaliarObservacaoManual(rs[0], antigas).mm24h, null);
});

test("nenhum texto do critério recomenda evacuação ou interdição", () => {
  const textos = [];
  D.ESTADOS.forEach((e) => textos.push(e.acaoDefesaCivil, e.orientacaoPopulacao, e.estado, e.descricao));
  textos.push(D.SEM_DADOS.acaoDefesaCivil, D.SEM_DADOS.orientacaoPopulacao, D.AVISO_CRITERIO);
  const permitida = "Evacuação, interdição e demais medidas dependem de decisão da Defesa Civil";
  for (const t of textos) assert.doesNotMatch(t.replace(permitida, ""), /evacua|interdi|saia imediatamente/i, t);
  // a única menção permitida diz que a decisão é da Defesa Civil
  D.ESTADOS.forEach((e) => assert.match(e.acaoDefesaCivil, /dependem de decisão da Defesa Civil/));
  assert.ok(D.ESTADOS.every((e) => e.nivel === D.ESTADOS.indexOf(e)));
  assert.equal(D.avaliarRisco({ mm1h: 60, mm24h: 200, mm168h: 300 }).criterioOficial, false);
});

test("código-fonte não recomenda evacuação/interdição a partir do critério pluviométrico", () => {
  const proibidos = [/Evacuação imediata/i, /interdição preventiva/i, /saia imediatamente/i, /saia do imóvel/i, /Normalidade \(Verde\)/];
  for (const arq of ["js/deslizamento.js", "js/painel-deslizamento.js", "js/publicar.js", "js/observacoes.js", "js/quadro.js", "js/historico.js", "js/painel-mapa.js", "index.html", "historico.html"]) {
    const src = readFileSync(RAIZ + "/" + arq, "utf8");
    for (const re of proibidos) assert.doesNotMatch(src, re, arq + " contém " + re);
  }
  for (const arq of ["js/painel-deslizamento.js", "js/publicar.js", "js/quadro.js", "js/historico.js", "js/painel-mapa.js"]) {
    const src = readFileSync(RAIZ + "/" + arq, "utf8");
    assert.doesNotMatch(src, /avaliarRisco\(\{\s*mm1h:\s*0,\s*mm24h:\s*0,\s*mm168h:\s*0/, arq + " usa 0/0/0 como valor padrão");
  }
});
