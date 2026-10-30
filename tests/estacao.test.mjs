// Testes da leitura do CSV da estação e do resumo por dia (js/estacao.js).
// O CSV abaixo é FICTÍCIO, montado só para testar o código (não é dado real).
import test from "node:test";
import assert from "node:assert/strict";
import { carregarScript } from "./util.mjs";
import { gerarCsvChuva, criarStorage, CABECALHO_CSV as CAB } from "./auxiliares.mjs";

const { Estacao } = carregarScript("js/estacao.js");

const CABECALHO = "tenant;sn;alias;category;data_hora;data_hora_brt;timestamp_ms;temperature_c;humidity_percent;pressure_hpa;wind_speed_mps;wind_speed_kmh;wind_direction_degrees;intensity_mm;accumulated_mm;rain_interval_mm;water_level_m;solar_radiation_wm2";
const p2 = (n) => String(n).padStart(2, "0");

// Uma leitura por minuto. dia = "10/01/2026"; minuto = 0..1439. Fuso fixo -03 (BRT), como no arquivo real.
function linha(dia, minuto, o = {}) {
  const [d, m, a] = dia.split("/").map(Number);
  const ts = Date.UTC(a, m - 1, d, 3, 0) + minuto * 60000;
  const temp = o.temp === undefined ? "15,0" : o.temp;
  return ["cajamar", "1", "Estação de Teste", "meteorologica", "", `${dia} ${p2(Math.floor(minuto / 60))}:${p2(minuto % 60)}:00`, ts,
    temp, "70,0", "935,0", "1", o.vento ?? "5,0", "180", "0", "0", o.chuva ?? "0", "", o.rad ?? "0"].join(";");
}

function csvDeUmDia() {
  const l = [CABECALHO];
  for (let min = 0; min < 1440; min++) {
    const o = {};
    if (min >= 100 && min <= 104) o.chuva = "0,2";   // 5 × 0,2 = 1,0 mm em 5 minutos
    if (min === 130) o.chuva = "0,4";
    if (min === 500) o.chuva = "1,2";                // rajada isolada
    if (min === 5) o.temp = "10,5";
    if (min === 800) o.temp = "25,5";
    if (min === 900) o.vento = "30,6";
    l.push(linha("10/01/2026", min, o));
  }
  return l.join("\r\n");
}

test("lerCsv: lê decimal com vírgula, BOM e delimitador ponto e vírgula", () => {
  const rows = Estacao.lerCsv("﻿" + csvDeUmDia());
  assert.equal(rows.length, 1440);
  assert.equal(rows[5].t, 10.5);
  assert.equal(rows[0].dia, "2026-01-10");
  assert.equal(rows[100].ch, 0.2);
});

test("lerCsv: falha com mensagem clara se faltarem colunas", () => {
  assert.throws(() => Estacao.lerCsv("a;b\n1;2"), /colunas ausentes/);
  assert.throws(() => Estacao.lerCsv("só uma linha"), /vazio/);
});

test("lerCsv: ignora linhas sem data válida e valor vazio vira null (não zero)", () => {
  const txt = [CABECALHO, linha("10/01/2026", 0, { temp: "" }), "x;x;x;x;x;sem data;abc;1;1;1;1;1;1;1;1;1;;1", linha("10/01/2026", 1)].join("\n");
  const rows = Estacao.lerCsv(txt);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].t, null);
  assert.equal(rows[1].t, 15);
});

test("resumir: soma a chuva do dia e calcula temperatura e vento", () => {
  const r = Estacao.resumir(Estacao.lerCsv(csvDeUmDia()))["2026-01-10"];
  assert.equal(r.n, 1440);
  assert.equal(r.chuva, 2.6);
  assert.equal(r.tmin, 10.5);
  assert.equal(r.tmax, 25.5);
  assert.equal(r.vmax, 30.6);
});

test("resumir: maior chuva em 10 min e em 1 h usa janela deslizante", () => {
  const r = Estacao.resumir(Estacao.lerCsv(csvDeUmDia()))["2026-01-10"];
  assert.equal(r.c10, 1.2, "a rajada isolada de 1,2 mm é a maior janela de 10 min (a primeira chuva dá 1,0)");
  assert.equal(r.c60, 1.4, "1,0 (minutos 100-104) + 0,4 (minuto 130) cabem em 1 hora");
});

test("resumir: duas pancadas com 12 min de intervalo não somam na janela de 10 min, mas somam na de 1 h", () => {
  const l = [CABECALHO];
  for (let m = 0; m < 1440; m++) l.push(linha("10/01/2026", m, m === 700 || m === 712 ? { chuva: "0,9" } : {}));
  const r = Estacao.resumir(Estacao.lerCsv(l.join("\n")))["2026-01-10"];
  assert.equal(r.c10, 0.9);
  assert.equal(r.c60, 1.8);
});

test("resumir: leituras repetidas (mesmo instante) não contam duas vezes", () => {
  const linhas = csvDeUmDia().split("\r\n");
  linhas.push(linhas[1 + 100]); // repete a leitura do minuto 100 (0,2 mm)
  const r = Estacao.resumir(Estacao.lerCsv(linhas.join("\r\n")))["2026-01-10"];
  assert.equal(r.n, 1440);
  assert.equal(r.chuva, 2.6);
});

test("resumir: separa dias e informa quantas leituras cada um teve", () => {
  const l = [CABECALHO];
  for (let m = 0; m < 1440; m++) l.push(linha("10/01/2026", m));
  for (let m = 0; m < 60; m++) l.push(linha("11/01/2026", m));
  const r = Estacao.resumir(Estacao.lerCsv(l.join("\n")));
  assert.deepEqual(Object.keys(r).sort(), ["2026-01-10", "2026-01-11"]);
  assert.equal(r["2026-01-10"].n, 1440);
  assert.equal(r["2026-01-11"].n, 60, "dia parcial aparece com poucas leituras");
});

test("resumir: chuva do dia com dia sem chuva dá zero (e não null)", () => {
  const l = [CABECALHO];
  for (let m = 0; m < 30; m++) l.push(linha("10/01/2026", m));
  const r = Estacao.resumir(Estacao.lerCsv(l.join("\n")))["2026-01-10"];
  assert.equal(r.chuva, 0);
  assert.equal(r.c10, 0);
});

test("resumir e detectarTipo: lê régua de nível do rio (water_level_m) e calcula mínimo, máximo e variação Δ", () => {
  const l = [
    CABECALHO,
    "cajamar;9001;Régua Rio Juquery;hidrologica;;10/01/2026 01:00:00;1768017600000;;;;;;;;;;1,25;0",
    "cajamar;9001;Régua Rio Juquery;hidrologica;;10/01/2026 02:00:00;1768021200000;;;;;;;;;;1,85;0"
  ];
  const rows = Estacao.lerCsv(l.join("\n"));
  assert.equal(Estacao.detectarTipo(rows), "nivel");
  const r = Estacao.resumir(rows)["2026-01-10"];
  assert.equal(r.nvMin, 1.25);
  assert.equal(r.nvMax, 1.85);
  assert.equal(r.nvDelta, 0.6);
});

test("mesclarNoSlot: suporta 3 estações meteorológicas e 1 régua de nível do rio separadamente", () => {
  const banco = Estacao.criarBancoVazio();
  const est1Rows = Estacao.lerCsv([CABECALHO, linha("10/01/2026", 0, { chuva: "2,0" })].join("\n"));
  const est2Rows = Estacao.lerCsv([
    CABECALHO,
    "cajamar;2;Estação Jordanésia;meteorologica;;10/01/2026 00:00:00;1768014000000;20,0;70,0;935,0;1;5,0;180;0;0;4,4;;0"
  ].join("\n"));
  const reguaRows = Estacao.lerCsv([
    CABECALHO,
    "cajamar;99;Régua Nível Rio;hidrologica;;10/01/2026 00:00:00;1768014000000;;;;;;;;;;2,10;0"
  ].join("\n"));

  const r1 = Estacao.mesclarNoSlot(banco, "auto", est1Rows, "estacao1.csv");
  const r2 = Estacao.mesclarNoSlot(banco, "auto", est2Rows, "estacao2.csv");
  const rr = Estacao.mesclarNoSlot(banco, "auto", reguaRows, "regua.csv");

  assert.equal(r1.slotId, "est1");
  assert.equal(r2.slotId, "est2");
  assert.equal(rr.slotId, "regua");
  assert.equal(banco.slots.est1.dias["2026-01-10"].chuva, 2);
  assert.equal(banco.slots.est2.dias["2026-01-10"].chuva, 4.4);
  assert.equal(banco.slots.regua.dias["2026-01-10"].nvMax, 2.1);
});

// ======================= Histórico: cobertura, janelas móveis, importação, cotas e backup =======================
const diasDe = (csv) => Estacao.resumir(Estacao.lerCsv(csv));
const DIA = 288; // leituras por dia a cada 5 min
const doDia = (d) => Array.from({ length: DIA }, (_, i) => d * DIA + i);

test("168 h: sete dias completos geram acumulados móveis com cobertura registrada", () => {
  const dias = diasDe(gerarCsvChuva({ inicio: "2026-01-01" }));
  const j = Estacao.janelasDoDia(dias, "2026-01-07");
  assert.equal(j.mov168.estado, "OK");
  assert.equal(j.mov168.valor, 201.6);
  assert.equal(j.mov168.horasComDado, 168);
  assert.equal(j.mov168.leituras, 2016);
  assert.equal(j.mov168.cobertura, 1);
  assert.equal(j.mov24.valor, 28.8);
  assert.equal(j.max60.estado, "OK");
  assert.equal(j.civil.valor, 28.8);
  assert.equal(j.civil.completo, true);
  assert.equal(j.fimRotulo, "24:00");
});

test("168 h: um dia ausente → SEM_DADOS_SUFICIENTES com motivo; a soma parcial não vira acumulado", () => {
  const omit = new Set(doDia(2));
  const dias = diasDe(gerarCsvChuva({ inicio: "2026-01-01", omitir: (i) => omit.has(i) }));
  const j = Estacao.janelasDoDia(dias, "2026-01-07");
  assert.equal(j.mov168.estado, "SEM_DADOS_SUFICIENTES");
  assert.equal(j.mov168.valor, null);
  assert.equal(j.mov168.minimoParcial, 172.8);
  assert.match(j.mov168.motivo, /24 de 168 hora/);
  assert.equal(j.mov24.estado, "OK", "a janela de 24 h do último dia continua válida");
  assert.equal(j.mov24.valor, 28.8);
});

test("168 h: vários dias ausentes e série curta não são completos", () => {
  const omit = new Set([...doDia(1), ...doDia(3), ...doDia(4)]);
  const dias = diasDe(gerarCsvChuva({ inicio: "2026-01-01", omitir: (i) => omit.has(i) }));
  const j = Estacao.janelasDoDia(dias, "2026-01-07");
  assert.equal(j.mov168.valor, null);
  assert.match(j.mov168.motivo, /72 de 168 hora/);

  const curta = Estacao.janelasDoDia(diasDe(gerarCsvChuva({ inicio: "2026-01-01", horas: 72 })), "2026-01-03");
  assert.equal(curta.mov168.valor, null);
  assert.equal(curta.mov168.horasComDado, 72);
  assert.equal(curta.mov24.valor, 28.8);
});

test("dados duplicados não são somados duas vezes e são contados", () => {
  const dias = diasDe(gerarCsvChuva({ inicio: "2026-01-01", repetir: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19] }));
  assert.equal(dias["2026-01-01"].dup, 10);
  assert.equal(Estacao.janelasDoDia(dias, "2026-01-07").mov168.valor, 201.6);
});

test("dados fora de ordem dão o mesmo resultado e são contados", () => {
  const dias = diasDe(gerarCsvChuva({ inicio: "2026-01-01", embaralhar: true }));
  const fora = Object.keys(dias).reduce((s, k) => s + dias[k].foraOrdem, 0);
  assert.ok(fora > 2000);
  assert.equal(Estacao.janelasDoDia(dias, "2026-01-07").mov168.valor, 201.6);
});

test("intervalos irregulares: lacuna maior que 2x o intervalo típico invalida a janela; 1 leitura faltando é tolerada", () => {
  const lac = new Set([984, 985, 986, 987, 988, 989]); // 30 min sem leitura dentro de uma hora que ainda tem leituras
  const diasLac = diasDe(gerarCsvChuva({ inicio: "2026-01-01", omitir: (i) => lac.has(i) }));
  const j = Estacao.janelasDoDia(diasLac, "2026-01-07");
  assert.equal(j.mov168.horasComDado, 168, "todas as horas têm alguma leitura");
  assert.equal(j.mov168.estado, "SEM_DADOS_SUFICIENTES");
  assert.equal(j.mov168.lacunas, 1);
  assert.match(j.mov168.motivo, /lacuna/);
  assert.equal(diasLac["2026-01-04"].chuvaCompleta, false);

  const uma = diasDe(gerarCsvChuva({ inicio: "2026-01-01", omitir: (i) => i === 984 }));
  const ju = Estacao.janelasDoDia(uma, "2026-01-07");
  assert.equal(ju.mov168.estado, "OK");
  assert.equal(ju.mov168.valor, 201.5, "a leitura faltante NÃO é preenchida com zero nem estimada");
});

test("valores inválidos ou vazios ficam nulos (não viram 0) e são contados", () => {
  const dias = diasDe(gerarCsvChuva({ inicio: "2026-01-01", horas: 24, chuva: (i) => (i === 100 ? "abc" : i === 101 ? "-1" : i === 102 ? "" : "0,1") }));
  const d = dias["2026-01-01"];
  assert.equal(d.inv, 2, "texto e negativo são inválidos; vazio é apenas ausente");
  assert.equal(d.nChuva, DIA - 3);
  assert.equal(d.chuva, 28.5);
  assert.equal(Estacao.janelasDoDia(dias, "2026-01-01").mov24.estado, "SEM_DADOS_SUFICIENTES", "3 leituras seguidas faltando formam lacuna");

  const horaToda = diasDe(gerarCsvChuva({ inicio: "2026-01-01", horas: 24, chuva: (i) => (i >= 12 && i <= 23 ? "abc" : "0,1") }))["2026-01-01"];
  assert.equal(horaToda.hN[1], 0);
  assert.equal(horaToda.hMm[1], null, "hora sem leitura válida fica null, não 0");
  assert.equal(horaToda.cobHoras, 23);
});

test("chuva totalmente ausente permanece null no dia e nas janelas", () => {
  const dias = diasDe(gerarCsvChuva({ inicio: "2026-01-01", horas: 24, chuva: () => "" }));
  const d = dias["2026-01-01"];
  assert.equal(d.chuva, null);
  assert.equal(d.nChuva, 0);
  const j = Estacao.janelasDoDia(dias, "2026-01-01");
  assert.equal(j.civil.valor, null);
  assert.equal(j.mov24.valor, null);
  assert.match(j.mov24.motivo, /sem leitura válida/);
});

test("mudança de dia, mês, ano e ano bissexto não quebram a janela de 168 h", () => {
  const casos = [["2026-01-28", "2026-02-03"], ["2025-12-28", "2026-01-03"], ["2028-02-25", "2028-03-02"], ["2026-02-24", "2026-03-02"]];
  for (const [ini, fim] of casos) {
    const j = Estacao.janelasDoDia(diasDe(gerarCsvChuva({ inicio: ini })), fim);
    assert.equal(j.mov168.estado, "OK", ini + " → " + fim);
    assert.equal(j.mov168.valor, 201.6, ini + " → " + fim);
    assert.equal(j.mov24.valor, 28.8, ini + " → " + fim);
  }
});

test("dia parcial: a janela termina na última hora com leitura e o dia civil fica marcado como incompleto", () => {
  const dias = diasDe(gerarCsvChuva({ inicio: "2026-01-01", horas: 30 }));
  const j = Estacao.janelasDoDia(dias, "2026-01-02");
  assert.equal(j.fimRotulo, "06:00");
  assert.equal(j.mov24.estado, "OK");
  assert.equal(j.mov24.valor, 28.8);
  assert.equal(j.civil.completo, false);
  assert.equal(Estacao.diaCompleto(dias["2026-01-02"]), false);
});

test("dia guardado por versão anterior (sem detalhe horário) não gera janela móvel", () => {
  const j = Estacao.janelasDoDia({ "2026-01-07": { n: 1440, chuva: 10, c60: 2 } }, "2026-01-07");
  assert.equal(j.mov168.estado, "SEM_DADOS_SUFICIENTES");
  assert.match(j.mov168.motivo, /sem detalhe horário/);
  assert.equal(Estacao.diaCompleto({ n: 1440 }), null);
});

test("lerCsv registra as linhas descartadas com o motivo (nada some em silêncio)", () => {
  const ts = Date.UTC(2026, 0, 10, 3, 0);
  const l = (dh, t) => ["x", "1", "E", "meteorologica", "", dh, t, "15,0", "70,0", "935,0", "1", "5,0", "180", "0", "0", "0,1", "", "0"].join(";");
  const rows = Estacao.lerCsv([CAB, l("10/01/2026 00:00:00", ts), l("10/01/2026 00:05:00", ""), l("11/01/2026 00:00:00", ts), l("31/02/2026 00:00:00", ts), l("sem data", ts)].join("\n"));
  assert.equal(rows.length, 1);
  assert.equal(rows.descartadas.length, 4);
  assert.ok(Array.from(rows.descartadas).some((x) => /não corresponde/.test(x.motivo)));
  assert.ok(Array.from(rows.descartadas).some((x) => /inexistente/.test(x.motivo)));
});

test("validarArquivoCsv: extensão, binário, vazio, tamanho e cabeçalho", () => {
  const ok = { nome: "a.csv", tamanho: 100, texto: gerarCsvChuva({ horas: 1 }) };
  assert.deepEqual(Array.from(Estacao.validarArquivoCsv(ok)), []);
  assert.ok(Estacao.validarArquivoCsv({ ...ok, nome: "a.txt" }).length);
  assert.ok(Estacao.validarArquivoCsv({ ...ok, texto: "PK\u0003\u0004\u0000\u0000binario" }).some((e) => /binário/.test(e)));
  assert.ok(Estacao.validarArquivoCsv({ ...ok, texto: "", tamanho: 0 }).length);
  assert.ok(Estacao.validarArquivoCsv({ ...ok, tamanho: Estacao.LIMITES_IMPORTACAO.maxBytesArquivo + 1 }).some((e) => /maior que/.test(e)));
  assert.ok(Estacao.validarArquivoCsv({ ...ok, texto: "{\"json\": true}" }).some((e) => /cabeçalho/.test(e)));
});

test("planejarImportacao: aceita até 4 arquivos; um inválido não altera nada e os válidos são importados", () => {
  const banco = Estacao.criarBancoVazio();
  const antes = JSON.stringify(banco);
  const bom = { nome: "est1.csv", tamanho: 100, texto: gerarCsvChuva({ horas: 48 }) };
  const ruim = { nome: "ruim.csv", tamanho: 10, texto: "a;b\n1;2" };
  const disfarcado = { nome: "disfarce.csv", tamanho: 10, texto: "PK\u0003\u0004\u0000\u0000zip" };
  const falhaLeitura = { nome: "lento.csv", tamanho: 10, erroLeitura: "NotReadableError" };
  const plano = Estacao.planejarImportacao(banco, [bom, ruim, disfarcado, falhaLeitura], "auto");
  assert.equal(JSON.stringify(banco), antes, "o banco original não é modificado");
  assert.equal(plano.alterado, true);
  assert.equal(plano.relatorio.importados.length, 1);
  assert.equal(plano.relatorio.rejeitados.length, 3);
  assert.equal(plano.relatorio.importados[0].add, 2);
  assert.match(plano.relatorio.rejeitados.map((r) => r.motivo).join("|"), /colunas ausentes/);
  assert.match(plano.relatorio.rejeitados.map((r) => r.motivo).join("|"), /binário/);
  assert.match(plano.relatorio.rejeitados.map((r) => r.motivo).join("|"), /falha na leitura/);

  const so = Estacao.planejarImportacao(banco, [ruim], "auto");
  assert.equal(so.alterado, false);
  assert.equal(JSON.stringify(so.banco), antes);
});

test("planejarImportacao: mais de 4 arquivos ou tamanho total excessivo são recusados por inteiro", () => {
  const banco = Estacao.criarBancoVazio();
  const a = { nome: "a.csv", tamanho: 10, texto: gerarCsvChuva({ horas: 1 }) };
  assert.throws(() => Estacao.planejarImportacao(banco, [a, a, a, a, a], "auto"), /máximo de 4/);
  assert.throws(() => Estacao.planejarImportacao(banco, [], "auto"), /nenhum arquivo/);
  const grande = { ...a, tamanho: Estacao.LIMITES_IMPORTACAO.maxBytesTotal };
  assert.throws(() => Estacao.planejarImportacao(banco, [grande, grande], "auto"), /tamanho total/);
});

test("validarCotas: rejeita vazio, negativo, texto, infinito e ordem inconsistente", () => {
  const ok = Estacao.validarCotas({ atencaoM: "1,5", alertaM: 2, transbordoM: 2.5 });
  assert.equal(ok.ok, true);
  assert.equal(ok.valores.atencaoM, 1.5);
  const casos = [
    [{ atencaoM: "", alertaM: 2, transbordoM: 3 }, /vazio/],
    [{ atencaoM: -1, alertaM: 2, transbordoM: 3 }, /negativo/],
    [{ atencaoM: "abc", alertaM: 2, transbordoM: 3 }, /não numérico/],
    [{ atencaoM: Infinity, alertaM: 2, transbordoM: 3 }, /infinito/],
    [{ atencaoM: 1, alertaM: NaN, transbordoM: 3 }, /não numérico/],
    [{ atencaoM: 0, alertaM: 2, transbordoM: 3 }, /maior que zero/],
    [{ atencaoM: 2, alertaM: 2, transbordoM: 3 }, /Atenção deve ser menor que Alerta/],
    [{ atencaoM: 1, alertaM: 3, transbordoM: 2 }, /Alerta deve ser menor que Transbordamento/],
    [{ atencaoM: 1, alertaM: 2, transbordoM: 3, deltaAtencaoCm: 50, deltaAlertaCm: 40 }, /Δ Atenção/],
    [undefined, /ausentes/]
  ];
  for (const [entrada, re] of casos) {
    const r = Estacao.validarCotas(entrada);
    assert.equal(r.ok, false);
    assert.match(r.erros.join("|"), re);
  }
});

test("salvarCotasRio: entrada inválida lança erro e não altera as cotas guardadas; dado guardado inválido não vira padrão em silêncio", () => {
  const st = criarStorage();
  assert.equal(Estacao.carregarCotasRio(st).origem, "padrao");
  Estacao.salvarCotasRio({ atencaoM: "1,9", alertaM: "2,4", transbordoM: "3", pontoMedicao: "Ponto X" }, st);
  const salvas = Estacao.carregarCotasRio(st);
  assert.equal(salvas.origem, "usuario");
  assert.equal(salvas.homologada, false);
  assert.equal(salvas.pontoMedicao, "Ponto X");
  const antes = st.getItem("cajamar:cotas_rio:v1");
  assert.throws(() => Estacao.salvarCotasRio({ atencaoM: "", alertaM: 2, transbordoM: 3 }, st), /Cotas inválidas/);
  assert.throws(() => Estacao.salvarCotasRio({ atencaoM: 3, alertaM: 2, transbordoM: 1 }, st), /ordem inválida/);
  assert.equal(st.getItem("cajamar:cotas_rio:v1"), antes);

  const corrompido = criarStorage({ "cajamar:cotas_rio:v1": JSON.stringify({ atencaoM: 3, alertaM: 2, transbordoM: 1 }) });
  const c = Estacao.carregarCotasRio(corrompido);
  assert.equal(c.invalida, true);
  assert.ok(c.erros.length);
  assert.equal(c.origem, "padrao");
  assert.throws(() => Estacao.salvarCotasRio({ atencaoM: 1, alertaM: 2, transbordoM: 3 }, criarStorage({}, { falharSempre: true })), /gravar/);
});

test("avaliarNivelRio: sem cotas validadas não classifica; sem cobertura não afirma normalidade", () => {
  const padrao = Estacao.carregarCotasRio(criarStorage());
  const a = Estacao.avaliarNivelRio(1.0, 0.1, padrao);
  assert.equal(a.id, "sem_referencia");
  assert.equal(a.nivel, null);
  assert.match(a.motivo, /sem fonte técnica/);
  assert.equal(Estacao.avaliarNivelRio(5.0, 0.1, padrao).id, "sem_referencia", "nem nível alto é classificado com cotas não validadas");

  const usuario = { atencaoM: 1.8, alertaM: 2.3, transbordoM: 2.8, deltaAtencaoCm: 35, deltaAlertaCm: 60, origem: "usuario" };
  assert.equal(Estacao.avaliarNivelRio(1.0, 0.1, usuario, { completo: true, horas: 24 }).id, "normal");
  const inc = Estacao.avaliarNivelRio(1.0, 0.1, usuario, { completo: false, horas: 10 });
  assert.equal(inc.id, "dados_insuficientes");
  assert.equal(inc.estado, "Dados insuficientes");
  assert.equal(Estacao.avaliarNivelRio(1.0, 0.1, usuario, { completo: null, horas: null }).id, "dados_insuficientes");
  assert.equal(Estacao.avaliarNivelRio(2.5, 0.1, usuario, { completo: false, horas: 3 }).id, "alerta", "ultrapassar a cota vale mesmo com dia incompleto");
  assert.equal(Estacao.avaliarNivelRio(1.0, null, usuario, { completo: true }).id, "normal", "Δ ausente não vira 0 nem dispara regra");
  assert.equal(Estacao.avaliarNivelRio(1.0, 0.1, { atencaoM: 3, alertaM: 2, transbordoM: 1 }).id, "sem_referencia");
  assert.equal(Estacao.avaliarNivelRio(null, null, usuario).id, "sem_dado");
  assert.equal(Estacao.qualidadeNivel({ cobHorasNivel: 24 }).completo, true);
  assert.equal(Estacao.qualidadeNivel({ cobHorasNivel: 20 }).completo, false);
  assert.equal(Estacao.qualidadeNivel({}).completo, null);
});

function storageComHistorico(opcoes) {
  const st = criarStorage({}, opcoes);
  const plano = Estacao.planejarImportacao(Estacao.carregarBanco(st), [{ nome: "est1.csv", tamanho: 100, texto: gerarCsvChuva({ horas: 48 }) }], "auto");
  const bkSt = criarStorage();
  assert.equal(Estacao.salvarBanco(plano.banco, bkSt), true);
  Estacao.salvarCotasRio({ atencaoM: 1.9, alertaM: 2.4, transbordoM: 3 }, bkSt);
  bkSt.setItem("cajamar:ocorrencias:v1", JSON.stringify([{ id: "oc1", tipo: "Alagamento" }]));
  bkSt.setItem("cajamar:observacoes:v1", JSON.stringify([{ id: "ob1", local: "Jordanésia", quando: "2026-01-02T10:00", chuvaMm: 5, janela: "1 h", ventoKmh: null }]));
  return Estacao.gerarBackupCompleto(bkSt);
}

test("restaurarBackupCompleto: backup válido é restaurado por inteiro, com resumo exato", () => {
  const bkp = storageComHistorico();
  const dest = criarStorage();
  const r = Estacao.restaurarBackupCompleto(JSON.stringify(bkp), dest);
  assert.equal(r.diasAdicionados, 2);
  assert.equal(r.ocorrenciasNovas, 1);
  assert.equal(r.observacoesNovas, 1);
  assert.equal(r.cotas, "aplicadas");
  const banco = Estacao.carregarBanco(dest);
  assert.equal(Object.keys(banco.slots.est1.dias).length, 2);
  assert.equal(Estacao.carregarCotasRio(dest).atencaoM, 1.9);
});

test("restaurarBackupCompleto: mescla por dia e não apaga nem sobrescreve o que já existe", () => {
  const bkp = storageComHistorico();
  const dest = criarStorage();
  const exist = Estacao.planejarImportacao(Estacao.carregarBanco(dest), [{ nome: "est1.csv", tamanho: 100, texto: gerarCsvChuva({ inicio: "2025-12-20", horas: 24 }) }], "auto");
  Estacao.salvarBanco(exist.banco, dest);
  Estacao.salvarCotasRio({ atencaoM: 1, alertaM: 2, transbordoM: 3 }, dest);
  dest.setItem("cajamar:contato", "199");
  const r = Estacao.restaurarBackupCompleto(bkp, dest);
  const banco = Estacao.carregarBanco(dest);
  assert.deepEqual(Object.keys(banco.slots.est1.dias).sort(), ["2025-12-20", "2026-01-01", "2026-01-02"]);
  assert.equal(Estacao.carregarCotasRio(dest).atencaoM, 1, "cotas já configuradas são mantidas");
  assert.match(r.cotas, /mantidas/);
  assert.equal(dest.getItem("cajamar:contato"), "199");
});

test("restaurarBackupCompleto: backup inválido não grava NADA e informa o motivo", () => {
  const bkp = storageComHistorico();
  const base = { "cajamar:ocorrencias:v1": JSON.stringify([{ id: "x" }]) };
  const casos = [
    ["json inválido", "{nao e json", /JSON válido/],
    ["sistema errado", { ...bkp, sistema: "outro" }, /sistema do backup/],
    ["versão errada", { ...bkp, versao: 99 }, /versão/],
    ["cotas fora de ordem", { ...bkp, cotasRio: { atencaoM: 3, alertaM: 2, transbordoM: 1 } }, /cotas do rio/],
    ["data inválida", { ...bkp, estacoes: { slots: { est1: { dias: { "2026-13-45": { n: 1 } } } } } }, /data inválida/],
    ["medição inválida", { ...bkp, estacoes: { slots: { est1: { dias: { "2026-01-01": { n: 5, chuva: "muita" } } } } } }, /chuva inválido/],
    ["chuva negativa", { ...bkp, estacoes: { slots: { est1: { dias: { "2026-01-01": { n: 5, chuva: -4 } } } } } }, /negativo/],
    ["estação desconhecida", { ...bkp, estacoes: { slots: { hack: { dias: {} } } } }, /desconhecida/],
    ["buckets horários errados", { ...bkp, estacoes: { slots: { est1: { dias: { "2026-01-01": { n: 5, hN: [1, 2] } } } } } }, /24 valores/],
    ["ocorrência sem id", { ...bkp, ocorrencias: [{ tipo: "x" }] }, /ocorrência 1/],
    ["observação malformada", { ...bkp, observacoes: [{ id: "o", local: "L", quando: "ontem" }] }, /observação 1/],
    ["estrutura de estações", { ...bkp, estacoes: { slots: "x" } }, /estrutura de estações/]
  ];
  for (const [nome, entrada, re] of casos) {
    const st = criarStorage(base);
    const antes = JSON.stringify(st.dados);
    assert.throws(() => Estacao.restaurarBackupCompleto(typeof entrada === "string" ? entrada : JSON.stringify(entrada), st), re, nome);
    assert.equal(JSON.stringify(st.dados), antes, nome + ": o armazenamento não pode mudar");
    assert.equal(st.escritas, 0, nome + ": nenhuma gravação");
  }
});

test("restaurarBackupCompleto: falha no meio da gravação reverte tudo e lança erro (nunca sucesso parcial)", () => {
  const bkp = storageComHistorico();
  const inicial = { "cajamar:observacoes:v1": JSON.stringify([{ id: "antiga", local: "L", quando: "2026-01-01T00:00", chuvaMm: 1 }]), "cajamar:contato": "199" };
  const st = criarStorage(inicial, { falharNaEscrita: 3 });
  const antes = JSON.stringify(st.dados);
  assert.throws(() => Estacao.restaurarBackupCompleto(JSON.stringify(bkp), st), /Restauração revertida/);
  assert.equal(JSON.stringify(st.dados), antes, "todas as chaves voltam ao estado anterior");

  const tamanho = "x".repeat(Estacao.LIMITES_IMPORTACAO.maxBytesArquivo);
  assert.throws(() => Estacao.restaurarBackupCompleto(tamanho, criarStorage()), /maior que/);
});

test("carregarBanco: dado ilegível é sinalizado e o original é preservado antes de qualquer gravação", () => {
  const st = criarStorage({ "cajamar:estacoes:v2": "{corrompido" });
  const banco = Estacao.carregarBanco(st);
  assert.match(banco.erroCarga, /ilegíveis/);
  assert.equal(Estacao.salvarBanco(banco, st), true);
  assert.equal(st.getItem("cajamar:estacoes:v2:corrompido"), "{corrompido");
  assert.equal(banco.erroCarga, undefined);
});

test("salvarBanco: falha de gravação reverte e devolve false", () => {
  const st = criarStorage({}, { falharNaEscrita: 2 });
  const banco = Estacao.criarBancoVazio();
  banco.slots.est1.dias["2026-01-01"] = { n: 1 };
  assert.equal(Estacao.salvarBanco(banco, st), false);
  assert.equal(st.getItem("cajamar:estacoes:v2"), null, "a primeira gravação foi desfeita");
});
