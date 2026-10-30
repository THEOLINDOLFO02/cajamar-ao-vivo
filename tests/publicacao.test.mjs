// Regras puras da geração de publicações (js/publicacao.js). Dados FICTÍCIOS.
import test from "node:test";
import assert from "node:assert/strict";
import { carregarScript } from "./util.mjs";
import { climaFixture, AGORA_MS } from "./auxiliares-publicar.mjs";

const P = carregarScript("js/publicacao.js").Publicacao;
const lista = (a) => JSON.parse(JSON.stringify(a));

test("valor: zero informado, ausente e inválido são estados diferentes; ausente nunca vira 0", () => {
  assert.equal(P.estadoValor(0).estado, "zero");
  assert.equal(P.estadoValor(3.2).estado, "ok");
  for (const v of [null, undefined, ""]) assert.equal(P.estadoValor(v).estado, "ausente");
  for (const v of ["abc", NaN, Infinity, {}]) assert.equal(P.estadoValor(v).estado, "invalido");
  assert.equal(P.mm(null), "—");
  assert.equal(P.mm(undefined), "—");
  assert.equal(P.mm(0), "0,0");
  assert.equal(P.pct(null), "—");
  assert.equal(P.pct(0), "0%");
  assert.equal(P.graus(NaN), "—");
  assert.equal(P.maiorOuIgual(null, 0), false);
  assert.equal(P.maiorOuIgual(0, 0), true);
});

test("referência temporal: usa o dia de Cajamar (America/Sao_Paulo), não o do aparelho nem o índice 0", () => {
  const r = P.referenciaTemporal(climaFixture(), AGORA_MS);
  assert.equal(r.ok, true);
  assert.equal(r.hojeIso, "2026-10-30");
  assert.equal(r.idxHoje, 7);

  // 23:30 em SP de 30/10 já é 31/10 em UTC: a referência continua 30/10
  const tarde = Date.UTC(2026, 9, 31, 2, 30);
  const r2 = P.referenciaTemporal(climaFixture({ agora: "2026-10-30T23:30" }), tarde);
  assert.equal(r2.ok, true);
  assert.equal(r2.hojeIso, "2026-10-30");
  assert.equal(P.dataSP(tarde), "2026-10-30");
  assert.equal(P.horaSP(tarde), "23:30");
});

test("referência temporal: mudança de mês e de ano", () => {
  const fimAno = Date.UTC(2026, 11, 31, 15, 0);
  const r = P.referenciaTemporal(climaFixture({ hoje: "2026-12-31", agora: "2026-12-31T12:00" }), fimAno);
  assert.equal(r.ok, true);
  assert.equal(r.idxHoje, 7);
  const f = climaFixture({ hoje: "2026-12-31", agora: "2026-12-31T12:00" });
  assert.equal(f.daily.time[8], "2027-01-01");
  const mes = P.referenciaTemporal(climaFixture({ hoje: "2026-02-28", agora: "2026-02-28T10:00" }), Date.UTC(2026, 1, 28, 14, 0));
  assert.equal(mes.ok, true);
});

test("referência temporal: data de hoje ausente, API de outro dia, séries com lacuna/duplicata/ordem errada e horários inválidos interrompem", () => {
  const deslocada = climaFixture();
  deslocada.daily.time = deslocada.daily.time.map((d) => P.dataSP(Date.parse(d + "T12:00:00Z") + 20 * 86400000));
  assert.match(P.referenciaTemporal(deslocada, AGORA_MS).motivo, /não foi encontrada/);

  assert.match(P.referenciaTemporal(climaFixture({ hoje: "2026-10-29", agora: "2026-10-29T14:00" }), AGORA_MS).motivo, /API retornou dados de 29\/10\/2026.*hoje em Cajamar.*30\/10\/2026/);

  const dup = climaFixture(); dup.daily.time[3] = dup.daily.time[2];
  assert.match(P.referenciaTemporal(dup, AGORA_MS).motivo, /duplicada/);
  const lac = climaFixture(); lac.daily.time.splice(4, 1);
  assert.match(P.referenciaTemporal(lac, AGORA_MS).motivo, /lacuna/);
  const ord = climaFixture(); ord.daily.time[3] = ord.daily.time[0];
  assert.match(P.referenciaTemporal(ord, AGORA_MS).motivo, /fora de ordem/);
  const inval = climaFixture(); inval.daily.time[1] = "2026-13-45";
  assert.match(P.referenciaTemporal(inval, AGORA_MS).motivo, /inválida/);

  const hdup = climaFixture(); hdup.hourly.time[10] = hdup.hourly.time[9];
  assert.match(P.referenciaTemporal(hdup, AGORA_MS).motivo, /horário duplicado/);
  const hinv = climaFixture(); hinv.hourly.time[5] = "texto";
  assert.match(P.referenciaTemporal(hinv, AGORA_MS).motivo, /horário inválido/);

  assert.match(P.referenciaTemporal(climaFixture({ semCurrent: true }), AGORA_MS).motivo, /horário atual/);
  assert.equal(P.referenciaTemporal(null, AGORA_MS).ok, false);
  assert.equal(P.referenciaTemporal({ daily: { time: [] } }, AGORA_MS).ok, false);
});

test("estado da fonte: ok, cache dentro do prazo, desatualizado e indisponível", () => {
  const lim = P.FRESCOR_MS.avisos;
  assert.equal(P.estadoFonte({ resultado: { dados: {}, antigo: false, de: AGORA_MS }, agoraMs: AGORA_MS, limiteMs: lim }).estado, "ok");
  const cache = P.estadoFonte({ resultado: { dados: {}, antigo: true, de: AGORA_MS - 3600000, erro: "HTTP 503" }, agoraMs: AGORA_MS, limiteMs: lim });
  assert.equal(cache.estado, "cache");
  assert.equal(cache.usavel, true);
  assert.match(cache.motivo, /HTTP 503/);
  const velho = P.estadoFonte({ resultado: { dados: {}, antigo: true, de: AGORA_MS - 5 * 3600000 }, agoraMs: AGORA_MS, limiteMs: lim });
  assert.equal(velho.estado, "desatualizado");
  assert.equal(velho.usavel, false);
  assert.equal(velho.ultimaValida, AGORA_MS - 5 * 3600000);
  const ind = P.estadoFonte({ resultado: null, erro: new Error("HTTP 500"), agoraMs: AGORA_MS, limiteMs: lim });
  assert.equal(ind.estado, "indisponivel");
  assert.equal(ind.motivo, "HTTP 500");
  assert.equal(P.estadoFonte({ resultado: null, erro: { name: "AbortError" }, agoraMs: AGORA_MS, limiteMs: lim }).motivo, "tempo esgotado");
});

test("avisos INMET: consulta com falha NUNCA vira \"sem avisos\"", () => {
  const ok = P.estadoFonte({ resultado: { dados: {}, antigo: false, de: AGORA_MS }, agoraMs: AGORA_MS, limiteMs: P.FRESCOR_MS.avisos });
  const ind = P.estadoFonte({ resultado: null, erro: new Error("rede"), agoraMs: AGORA_MS, limiteMs: P.FRESCOR_MS.avisos });
  const velho = P.estadoFonte({ resultado: { dados: {}, antigo: true, de: AGORA_MS - 9 * 3600000 }, agoraMs: AGORA_MS, limiteMs: P.FRESCOR_MS.avisos });
  assert.equal(P.statusAvisos(ok, [], AGORA_MS).estado, "sem_avisos");
  assert.equal(P.statusAvisos(ind, null, AGORA_MS).estado, "indisponivel");
  assert.equal(P.statusAvisos(ind, null, AGORA_MS).avisos, null);
  assert.equal(P.statusAvisos(velho, [{ evento: "X", fim: "2099-01-01 00:00" }], AGORA_MS).estado, "desatualizado");
  assert.equal(P.statusAvisos(velho, [{ evento: "X", fim: "2099-01-01 00:00" }], AGORA_MS).avisos, null);
  const com = P.statusAvisos(ok, [{ evento: "Tempestade", fim: "2026-10-30 23:59" }], AGORA_MS);
  assert.equal(com.estado, "com_avisos");
  assert.equal(com.avisos.length, 1);
  // aviso cujo fim já passou não é "ativo"
  assert.equal(P.statusAvisos(ok, [{ evento: "Velho", fim: "2026-10-29 10:00" }], AGORA_MS).estado, "sem_avisos");
  const cache = P.estadoFonte({ resultado: { dados: {}, antigo: true, de: AGORA_MS - 1800000 }, agoraMs: AGORA_MS, limiteMs: P.FRESCOR_MS.avisos });
  assert.equal(P.statusAvisos(cache, [{ evento: "A", fim: "2099-01-01 00:00" }], AGORA_MS).deCache, true);
});

test("focos INPE: com focos, sem focos (consulta válida) e indisponível são estados distintos", () => {
  const base = { coletadoEm: new Date(AGORA_MS).toISOString(), fonte: "INPE", arquivosLidos: 3, arquivosTentados: 3, parcial: false };
  const sem = P.statusFocos({ coleta: Object.assign({ focos: [] }, base) });
  assert.equal(sem.estado, "sem_focos");
  assert.equal(sem.n, 0);
  assert.match(sem.area, /Cajamar.*50 km/);
  assert.equal(sem.coletadoEm, AGORA_MS);
  const com = P.statusFocos({ coleta: Object.assign({ focos: [{}, {}] }, base) });
  assert.equal(com.estado, "com_focos");
  assert.equal(com.n, 2);
  const ind = P.statusFocos({ coleta: null, erro: new Error("servidor de focos do INPE indisponível"), ultimaValida: { t: AGORA_MS - 7200000, n: 4 } });
  assert.equal(ind.estado, "indisponivel");
  assert.equal(ind.n, null, "sem consulta não existe contagem (nem zero)");
  assert.equal(ind.ultimaValida.n, 4);
  // consulta parcial sem focos não prova ausência de focos
  const parc = P.statusFocos({ coleta: Object.assign({}, base, { focos: [], parcial: true, arquivosLidos: 1, arquivosTentados: 4 }) });
  assert.equal(parc.estado, "indisponivel");
  assert.match(parc.motivo, /1 de 4/);
  const parcCom = P.statusFocos({ coleta: Object.assign({}, base, { focos: [{}], parcial: true, arquivosLidos: 1, arquivosTentados: 4 }) });
  assert.equal(parcCom.estado, "com_focos");
  assert.equal(parcCom.parcial, true);
});

test("rastro: fonte, natureza, referência, coleta, cache/desatualizado e parcial aparecem no texto; nada é inventado", () => {
  const t = P.textoRastro({ fonte: "Open-Meteo", natureza: "previsão do modelo", referenciaIso: "2026-10-30", coletaMs: AGORA_MS, estado: "ok" });
  assert.match(t, /Fonte: Open-Meteo · previsão do modelo · ref\. 30\/10\/2026 · coleta 30\/10 14:05 \(SP\)/);
  assert.doesNotMatch(t, /DESATUALIZADO|CACHE|PARCIAIS/);
  assert.match(P.textoRastro({ fonte: "X", estado: "cache", ultimaValidaMs: AGORA_MS - 3600000 }), /DADO DO CACHE \(última atualização válida 30\/10 13:05\)/);
  assert.match(P.textoRastro({ fonte: "X", estado: "desatualizado", ultimaValidaMs: AGORA_MS - 9 * 3600000 }), /DESATUALIZADO/);
  assert.match(P.textoRastro({ fonte: "X", estado: "indisponivel" }), /FONTE INDISPONÍVEL/);
  assert.match(P.textoRastro({ fonte: "X", parcial: true }), /DADOS PARCIAIS/);
  assert.doesNotMatch(P.textoRastro({ fonte: "X" }), /coleta/, "sem horário de coleta não se escreve horário");
});

test("encaixarTexto: quebra palavras, palavra gigante, limite de linhas e aviso de linhas ocultas", () => {
  const medir = (s) => s.length * 10;
  assert.deepEqual(lista(P.encaixarTexto("uma frase curta", 300, medir, 3).linhas), ["uma frase curta"]);
  const longa = P.encaixarTexto("palavra ".repeat(40), 200, medir, 3);
  assert.equal(longa.linhas.length, 3);
  assert.equal(longa.truncado, true);
  assert.ok(longa.ocultas > 0);
  assert.ok(longa.linhas.every((l) => medir(l) <= 200), "toda linha cabe");
  assert.match(longa.linhas[2], /…$/);
  const gigante = P.encaixarTexto("x".repeat(95), 200, medir, 10);
  assert.ok(gigante.linhas.every((l) => medir(l) <= 200));
  assert.equal(gigante.linhas.join(""), "x".repeat(95));
  assert.deepEqual(lista(P.encaixarTexto("", 100, medir, 2).linhas), []);
  assert.equal(P.cortarComReticencias("abcdefghij", 50, medir), "abcd…");
});

test("faixa: automática informativa não é verde de normalidade; manual é marcada como do operador; incoerência exige justificativa", () => {
  const auto = { cor: "#0284c7", texto: "PREVISÃO · INFORMATIVO", origem: "automatica", sev: null };
  const a = P.avaliarFaixa(auto, { nivel: "auto", texto: "PREVISÃO · INFORMATIVO" });
  assert.equal(a.porOperador, false);
  assert.equal(a.selo, "");
  assert.equal(a.bloqueia, false);

  const verdeEmergencia = P.avaliarFaixa(auto, { nivel: "normal", texto: "🚨 EMERGÊNCIA: EVACUAÇÃO" });
  assert.equal(verdeEmergencia.porOperador, true);
  assert.equal(verdeEmergencia.incoerente, true);
  assert.equal(verdeEmergencia.bloqueia, true);
  assert.match(verdeEmergencia.selo, /FAIXA DEFINIDA PELO OPERADOR/);

  const vermelhoNormal = P.avaliarFaixa(auto, { nivel: "emergencia", texto: "🟢 CONDIÇÃO NORMAL · TEMPO SEM ALERTAS" });
  assert.equal(vermelhoNormal.incoerente, true);
  assert.equal(vermelhoNormal.bloqueia, true);

  const justificada = P.avaliarFaixa(auto, { nivel: "normal", texto: "⚠️ AVISO ATIVO", justificativa: "decisão do coordenador" });
  assert.equal(justificada.incoerente, true);
  assert.equal(justificada.bloqueia, false);
  assert.match(justificada.selo, /Justificativa: decisão do coordenador/);

  const curta = P.avaliarFaixa(auto, { nivel: "normal", texto: "⚠️ AVISO ATIVO", justificativa: "ok" });
  assert.equal(curta.bloqueia, true, "justificativa precisa ter conteúdo");

  const coerente = P.avaliarFaixa(auto, { nivel: "emergencia", texto: "ALERTA: chuva forte" });
  assert.equal(coerente.incoerente, false);
  assert.equal(coerente.porOperador, true);

  const texto = P.avaliarFaixa(auto, { nivel: "auto", texto: "Texto livre do operador" });
  assert.equal(texto.porOperador, true, "alterar só o texto também é marcado");
  assert.equal(texto.cor, "#0284c7");

  const inmet = { cor: "#FF7F00", texto: "⚠️ AVISO INMET ATIVO: TEMPESTADE", origem: "inmet", sev: 3 };
  assert.equal(P.avaliarFaixa(inmet, { nivel: "auto", texto: inmet.texto }).origem, "inmet");
  assert.equal(P.avaliarFaixa(inmet, { nivel: "normal", texto: inmet.texto }).bloqueia, true);
});

test("ciclo de geração: só 'pronto' exporta; nova geração invalida a anterior; falha limpa; token antigo é ignorado", () => {
  const c = P.criarCiclo();
  assert.equal(c.podeExportar("flyer_dia").ok, false);
  const t1 = c.iniciar({ tipo: "flyer_dia", formato: "stories" });
  assert.equal(c.get().estado, "gerando");
  assert.match(c.podeExportar("flyer_dia").motivo, /ainda está sendo gerada/);
  assert.equal(c.concluir(t1, { tipo: "flyer_dia", formato: "stories", dataRef: "2026-10-30" }), true);
  assert.equal(c.podeExportar("flyer_dia", "stories").ok, true);
  assert.match(c.podeExportar("aviso").motivo, /não corresponde ao modelo/);
  assert.match(c.podeExportar("flyer_dia", "feed").motivo, /formato/);

  const t2 = c.iniciar({ tipo: "aviso" });
  assert.equal(c.podeExportar("flyer_dia").ok, false, "ao iniciar uma nova geração a imagem anterior deixa de ser exportável");
  assert.equal(c.falhar(t2, "sem avisos"), true);
  assert.equal(c.get().meta, null);
  assert.match(c.podeExportar("aviso").motivo, /sem avisos/);

  const t3 = c.iniciar({ tipo: "dica" });
  const t4 = c.iniciar({ tipo: "dica" });
  assert.equal(c.concluir(t3, {}), false, "montagem antiga terminando depois não libera a nova");
  assert.equal(c.get().estado, "gerando");
  assert.equal(c.concluir(t4, { tipo: "dica", formato: "stories" }), true);
  c.invalidar("erro de desenho");
  assert.equal(c.podeExportar("dica").ok, false);
});
