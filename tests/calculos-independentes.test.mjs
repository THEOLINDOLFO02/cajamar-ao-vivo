// Testes INDEPENDENTES dos cálculos: cada valor esperado foi calculado À MÃO (aritmética mostrada no comentário) ou vem de uma
// constante conhecida, nunca da própria função auditada. Dados FICTÍCIOS. Cobrem a auditoria de cálculos meteorológicos.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { carregarScripts, RAIZ } from "./util.mjs";
import { gerarCsvChuva, criarStorage, CABECALHO_CSV } from "./auxiliares.mjs";
import { montar, TOLERANCIA_FUTURO_MIN } from "../worker/cemaden-proxy.js";

const ctx = carregarScripts(["js/serie-om.js", "js/estacao.js", "js/deslizamento.js", "js/queimadas.js", "js/modelos.js", "js/ar.js", "js/publicacao.js"]);
const { SerieOM, Estacao, Deslizamento, Queimadas, Modelos, Ar, Publicacao } = ctx;
const diasDe = (csv) => Estacao.resumir(Estacao.lerCsv(csv));
const BRT = 3 * 3600000;

// ---------- 1 a 5: precipitação horária (convenção do Open-Meteo: valor em T = soma da hora ANTERIOR) ----------
test("1. zero verdadeiro de precipitação é zero (completo), não ausência", () => {
  const r = SerieOM.somaHoras(new Array(24).fill(0), 0, 24);
  assert.equal(r.valor, 0);
  assert.equal(r.completo, true);
  assert.equal(r.comDado, 24);
  const d = diasDe(gerarCsvChuva({ horas: 24, chuva: () => "0,0" }))["2026-01-01"];
  assert.equal(d.chuva, 0, "0 mm medido em todas as leituras = 0");
  assert.equal(d.nChuva, 288);
});

test("2. precipitação ausente não vira zero: soma incompleta devolve null e conta as horas válidas", () => {
  const v = new Array(24).fill(1); v[10] = null;
  const r = SerieOM.somaHoras(v, 0, 24);
  assert.equal(r.valor, null);
  assert.equal(r.comDado, 23);
  assert.equal(r.completo, false);
  const d = diasDe(gerarCsvChuva({ horas: 24, chuva: () => "" }))["2026-01-01"];
  assert.equal(d.chuva, null);
  assert.equal(d.nChuva, 0);
});

test("3. precipitação inválida (negativa, texto, infinita) não entra na soma e invalida a janela", () => {
  for (const ruim of [-1, "abc", Infinity, NaN]) {
    const v = new Array(24).fill(1); v[3] = ruim;
    assert.equal(SerieOM.somaHoras(v, 0, 24).valor, null, String(ruim));
  }
  const d = diasDe(gerarCsvChuva({ horas: 24, chuva: (i) => (i === 5 ? "abc" : i === 6 ? "-2,0" : "0,1") }))["2026-01-01"];
  assert.equal(d.inv, 2);
  assert.equal(d.nChuva, 286); // 288 leituras - 2 inválidas
  assert.equal(d.chuva, 28.6); // 286 x 0,1
});

test("4. série horária completa: soma exata (0,1 + 0,2 + ... + 2,4 = 0,1 x 24 x 25 / 2 = 30)", () => {
  const v = Array.from({ length: 24 }, (_, i) => Math.round((i + 1)) / 10);
  assert.equal(SerieOM.somaHoras(v, 0, 24).valor, 30);
});

test("5. série horária incompleta: janela maior que a série ou com furo não é completa", () => {
  assert.equal(SerieOM.somaHoras(new Array(10).fill(1), 0, 24).valor, null, "série tem só 10 valores");
  assert.equal(SerieOM.somaHoras(new Array(30).fill(1), 20, 24).valor, null, "janela passa do fim da série");
  assert.equal(SerieOM.somaHoras(new Array(30).fill(1), -3, 24).valor, null, "janela começa antes do início");
});

// ---------- 6 a 9: série da estação (CSV) ----------
test("6. duplicidade de registros não soma duas vezes (288 leituras x 0,1 mm = 28,8 mm)", () => {
  const d = diasDe(gerarCsvChuva({ horas: 24, repetir: [0, 1, 2, 3, 100, 200] }))["2026-01-01"];
  assert.equal(d.chuva, 28.8);
  assert.equal(d.dup, 6);
  assert.equal(d.n, 288);
});

test("7. registros fora de ordem dão o mesmo total", () => {
  const d = diasDe(gerarCsvChuva({ horas: 24, embaralhar: true }))["2026-01-01"];
  assert.equal(d.chuva, 28.8);
  assert.ok(d.foraOrdem >= 287);
});

test("8. virada de meia-noite: janela móvel de 2 h entre 23:00 e 01:00 = 2 x 1,2 mm (12 leituras de 0,1 por hora)", () => {
  const dias = diasDe(gerarCsvChuva({ inicio: "2026-01-01", horas: 48 }));
  const fim = Date.UTC(2026, 0, 2, 1, 0) + BRT; // 01:00 BRT de 02/01
  const w = Estacao.acumuladoMovel(dias, fim, 2);
  assert.equal(w.estado, "OK");
  assert.equal(w.valor, 2.4);
  assert.equal(w.leituras, 24);
  // o dia civil 01/01 NÃO é a janela de 24 h: 24 h terminando 01:00 de 02/01 = 1 h do dia 01/01 anterior (23:00) ...
  const w24 = Estacao.acumuladoMovel(dias, fim, 24);
  assert.equal(w24.valor, 28.8, "24 h x 1,2 mm/h");
  assert.equal(dias["2026-01-02"].chuva, 28.8, "dia civil incompleto no teste não é usado: este valor vem do CSV de 48 h");
});

test("9. virada de mês (31/01 -> 01/02): janela de 3 h até 02:00 de 01/02 = 3,6 mm", () => {
  const dias = diasDe(gerarCsvChuva({ inicio: "2026-01-31", horas: 48 }));
  const fim = Date.UTC(2026, 1, 1, 2, 0) + BRT;
  const w = Estacao.acumuladoMovel(dias, fim, 3);
  assert.equal(w.valor, 3.6);
  assert.equal(Object.keys(dias).sort().join(), "2026-01-31,2026-02-01");
});

// ---------- 10: fusos ----------
test("10. conversão UTC/BRT sem erro de uma ou três horas", () => {
  assert.equal(Publicacao.dataSP(Date.UTC(2026, 0, 1, 2, 30)), "2025-12-31", "02:30 UTC = 23:30 de 31/12 em Cajamar");
  assert.equal(Publicacao.horaSP(Date.UTC(2026, 0, 1, 2, 30)), "23:30");
  assert.equal(Publicacao.horaSP(Date.UTC(2026, 5, 15, 15, 0)), "12:00", "sem horário de verão em 2026");
  assert.equal(Queimadas.converterDataGmt("2026-03-01 02:30:00").brt, "28/02 23:30");
  assert.equal(Queimadas.converterDataGmt("2026-10-30 16:30:00").ts, Date.UTC(2026, 9, 30, 16, 30));
  const dias = diasDe(gerarCsvChuva({ inicio: "2026-03-01", horas: 24 }));
  assert.deepEqual(Object.keys(dias), ["2026-03-01"]);
});

// ---------- 11 e 12 ----------
test("11. janela móvel exata de 24 h: valores 7..30 somados = (7 + 30) x 24 / 2 = 444", () => {
  const v = Array.from({ length: 48 }, (_, i) => i);
  const r = SerieOM.acumuladoAte(v, 30, 24);
  assert.equal(r.valor, 444);
  assert.equal(SerieOM.acumuladoAte(v, 30, 23).valor, (8 + 30) * 23 / 2, "23 h: 8..30 = 437");
  // "próximas 24 h depois do índice 30" = índices 31..54: fora da série de 48 valores
  assert.equal(SerieOM.previstoDepois(v, 30, 24).valor, null);
  assert.equal(SerieOM.previstoDepois(v, 20, 24).valor, (21 + 44) * 24 / 2, "21..44 = 780");
});

test("12. 168 h com uma hora sem leitura: sem acumulado, só o mínimo parcial (167 h x 1,2 = 200,4)", () => {
  const omit = new Set(Array.from({ length: 12 }, (_, k) => 12 * 50 + k)); // some a hora 50 inteira
  const dias = diasDe(gerarCsvChuva({ inicio: "2026-01-01", horas: 168, omitir: (i) => omit.has(i) }));
  const j = Estacao.janelasDoDia(dias, "2026-01-07");
  assert.equal(j.mov168.valor, null);
  assert.equal(j.mov168.estado, "SEM_DADOS_SUFICIENTES");
  assert.equal(j.mov168.minimoParcial, 200.4);
  assert.equal(j.mov168.horasComDado, 167);
  assert.equal(j.mov168.cobertura, 167 / 168);
});

// ---------- 13: unidades ----------
test("13. unidade incorreta: valores impossíveis para a grandeza são recusados e contados (não viram dado)", () => {
  const l = (o) => ["x", "1", "E", "meteorologica", "", "01/01/2026 00:00:00", Date.UTC(2026, 0, 1, 3, 0), o.t, o.u, o.p, "1", o.v, "180", "0", "0", "0,1", "", o.rad].join(";");
  const rows = Estacao.lerCsv([CABECALHO_CSV, l({ t: "25,0", u: "60,0", p: "1013,0", v: "10,0", rad: "500" }), // tudo plausível
    l({ t: "300,0", u: "150,0", p: "101300,0", v: "-5,0", rad: "9000" })].map((x, i) => (i === 2 ? x.replace("00:00:00", "00:05:00").replace(String(Date.UTC(2026, 0, 1, 3, 0)), String(Date.UTC(2026, 0, 1, 3, 5))) : x)).join("\n"));
  assert.equal(rows[0].t, 25);
  assert.equal(rows[1].t, null, "300 °C (ex.: Kelvin lido como Celsius)");
  assert.equal(rows[1].u, null, "umidade 150 %");
  assert.equal(rows[1].p, null, "101300 (Pa lido como hPa)");
  assert.equal(rows[1].v, null, "vento negativo");
  assert.equal(rows[1].rad, null, "radiação 9000 W/m²");
  assert.equal(rows[1].fx, 5);
  assert.equal(Estacao.resumir(rows)["2026-01-01"].foraFaixa, 5);
  assert.equal(Estacao.LIMITES_FISICOS.u[1], 100);
});

// ---------- 14 a 16: fontes ----------
test("14. resposta de API desatualizada é identificada pela idade, e não pela hora do aparelho", () => {
  const agora = Date.UTC(2026, 9, 30, 17, 0);
  const antigo = (h) => Publicacao.estadoFonte({ resultado: { dados: {}, antigo: true, de: agora - h * 3600000 }, agoraMs: agora, limiteMs: 3 * 3600000 });
  assert.equal(antigo(2).estado, "cache");
  assert.equal(antigo(3).estado, "cache", "exatamente no limite ainda é cache");
  assert.equal(antigo(3.01).estado, "desatualizado");
  assert.equal(Publicacao.estadoFonte({ resultado: { dados: {}, antigo: false, de: agora }, agoraMs: agora, limiteMs: 3 * 3600000 }).estado, "ok");
});

test("15. divergência entre fontes/modelos: amplitude e concordância calculadas à mão", () => {
  // valores 2 e 30: min 2, máx 30, média 16, amplitude 28, 28/30 = 0,93 >= 0,7 => divergem muito
  const r = Modelos.resumirJanela([2, 30]);
  assert.deepEqual([r.min, r.max, r.media, r.amplitude, r.comChuva], [2, 30, 16, 28, 2]);
  assert.equal(Modelos.concordancia(r).nivel, 2);
  // valores 10, 11: amplitude 1 (< 3) => boa concordância
  assert.equal(Modelos.concordancia(Modelos.resumirJanela([10, 11])).nivel, 0);
});

test("16. falha de coleta do CEMADEN: resposta pequena demais é rejeitada, não vira lista vazia", () => {
  assert.throws(() => montar([]), /formato inesperado/);
  assert.throws(() => montar(null), /formato inesperado/);
  assert.throws(() => montar(new Array(10).fill({})), /formato inesperado/);
});

// ---------- 17: extremos ----------
test("17. dado extremo legítimo (96 mm em 1 h, 45 °C, 98 km/h) é mantido, não descartado", () => {
  const linhasRain = Array.from({ length: 12 }, (_, k) => k); // 12 leituras de 5 min x 8 mm = 96 mm em 60 min
  const csv = gerarCsvChuva({ horas: 2, chuva: (i) => (i < 12 ? "8,0" : "0,0") });
  const d = diasDe(csv)["2026-01-01"];
  assert.equal(d.c60, 96, "12 x 8,0");
  assert.equal(d.c10, 16, "2 leituras x 8,0 em 10 min");
  assert.equal(d.chuva, 96);
  assert.equal(d.foraFaixa, 0);
  assert.ok(linhasRain.length === 12);
  const rows = Estacao.lerCsv(csv.replace(/;15,0;/g, ";45,0;").replace(/;5,0;180;/g, ";98,0;180;"));
  assert.equal(rows[0].t, 45);
  assert.equal(rows[0].v, 98);
});

// ---------- 18 e 19: natureza do dado ----------
test("18. previsão não é confundida com observação: série horária é 'modelo', projeção é 'previsao'", () => {
  const time = [], precipitation = [];
  for (let d = 0; d < 9; d++) for (let h = 0; h < 24; h++) { time.push(`2026-01-${String(1 + d).padStart(2, "0")}T${String(h).padStart(2, "0")}:00`); precipitation.push(1); }
  const s = Deslizamento.extrairDeSerieHoraria({ time, precipitation }, "2026-01-08T10:15");
  assert.equal(s.atual.tipoDado, "modelo");
  assert.equal(s.projecao24h.tipoDado, "previsao");
  assert.equal(s.atual.mm24h, 24, "24 valores de 1 mm (9h do dia 7 até 10h do dia 8)");
  assert.equal(s.atual.mm168h, 168, "168 valores de 1 mm");
  assert.equal(s.projecao24h.mm24h, 24, "próximas 24 h = 24 valores depois de 10:00");
  const est = Deslizamento.avaliarDiaEstacao(diasDe(gerarCsvChuva({ horas: 168 })), "2026-01-07", "E");
  assert.equal(est.tipoDado, "medicao");
});

test("19. simulação nunca é medição", () => {
  const av = Deslizamento.avaliarRisco({ mm1h: 20, mm24h: 60, mm168h: 110, tipo: "simulacao" });
  assert.equal(av.tipoDado, "simulacao");
  assert.notEqual(av.tipoDado, "medicao");
  assert.equal(Deslizamento.avaliarRisco({ mm1h: 20, mm24h: 60, mm168h: 110 }).tipoDado, "medicao", "sem tipo informado o padrão é medição: quem simula precisa declarar");
});

// ---------- 20: indicadores com variáveis ausentes ----------
test("20. fogo e deslizamento com variáveis ausentes não são calculados", () => {
  for (const f of [{}, { temp: 30 }, { temp: 30, umid: 20 }, { temp: 30, umid: 20, vento: 10 }, { temp: 30, umid: 20, chuva24h: 0 }, { umid: 20, vento: 1, chuva24h: 0 }]) {
    assert.equal(Queimadas.calcularRiscoFogoLocal(f), null, JSON.stringify(f));
  }
  assert.equal(Deslizamento.avaliarRisco({ mm1h: 5 }).conclusivo, false);
  assert.equal(Deslizamento.avaliarRisco({ mm1h: 5, mm24h: 10 }).nivel, null);
});

// ---------- correções da auditoria: regressões específicas ----------
test("A1. hora atual ausente na série: sem janela (nunca o índice 0)", () => {
  assert.equal(SerieOM.indiceHora(["2026-01-01T00:00", "2026-01-01T01:00"], "2026-01-02T00:15"), -1);
  assert.equal(SerieOM.indiceHora(["2026-01-01T00:00", "2026-01-01T01:00"], "2026-01-01T01:45"), 1);
  assert.equal(SerieOM.indiceHora(null, "2026-01-01T01:45"), -1);
  assert.equal(SerieOM.indiceHora(["2026-01-01T00:00"], undefined), -1);
  const tempos = []; for (let h = 0; h < 72; h++) tempos.push(`2026-01-0${1 + Math.floor(h / 24)}T${String(h % 24).padStart(2, "0")}:00`);
  const j = { current: { time: "2027-05-05T10:00" }, hourly: { time: tempos, precipitation_best_match: tempos.map(() => 1) } };
  const t = Modelos.totais(j);
  assert.equal(t.referencia.h24, null);
  assert.equal(t.referencia.h48, null);
  assert.equal(Ar.resumir({ current: { time: "2027-05-05T10:00", us_aqi: 40 }, hourly: { time: tempos, us_aqi: tempos.map(() => 99) } }).piorAqi24h, null);
});

test("A2. 'próximas 24 h' do modelo começam DEPOIS da hora atual (valor horário = soma da hora anterior)", () => {
  const tempos = []; for (let h = 0; h < 72; h++) tempos.push(`2026-01-0${1 + Math.floor(h / 24)}T${String(h % 24).padStart(2, "0")}:00`);
  // índice da hora atual (10:00 do dia 1) = 10; valores = índice. Próximas 24 h = índices 11..34 => (11 + 34) x 24 / 2 = 540
  const j = { current: { time: "2026-01-01T10:20" }, hourly: { time: tempos, precipitation_best_match: tempos.map((_, i) => i) } };
  assert.equal(Modelos.totais(j).referencia.h24, 540);
  // 24 a 48 h = índices 35..58 => (35 + 58) x 24 / 2 = 1116
  assert.equal(Modelos.totais(j).referencia.h48, 1116);
});

test("A3. chuva de 'current' é do intervalo informado (15 min), não da hora", () => {
  assert.equal(SerieOM.intervaloCurrentMin({ interval: 900 }), 15);
  assert.equal(SerieOM.intervaloCurrentMin({ interval: 3600 }), 60);
  assert.equal(SerieOM.intervaloCurrentMin({}), null);
  assert.equal(SerieOM.intervaloCurrentMin(null), null);
  const clima = readFileSync(join(RAIZ, "js/painel-clima.js"), "utf8");
  assert.doesNotMatch(clima, /soma24\s*\*\s*0\.25/, "fator inventado de 25% removido");
  assert.doesNotMatch(clima, /Math\.max\(0,\s*j\.(hourly|daily)\.time\.indexOf/, "sem índice 0 de reserva");
  assert.doesNotMatch(clima, /Chuva \(hora atual\)/);
  const resumo = readFileSync(join(RAIZ, "js/resumo.js"), "utf8");
  assert.doesNotMatch(resumo, /mm de chuva na hora/);
});

test("A4. índice UV classificado pelo valor inteiro (escala OMS): 2,6 é 3 (Moderado)", () => {
  assert.equal(Ar.classificarUv(2.4).nome, "Baixo");
  assert.equal(Ar.classificarUv(2.6).nome, "Moderado");
  assert.equal(Ar.classificarUv(10.6).nome, "Extremo");
});

test("A5. CEMADEN: leitura à frente do relógio da coleta não define a referência da rede", () => {
  const est = (ibge, nome, leitura) => ({ idestacao: Math.floor(Math.random() * 1e6), uf: "SP", codibge: ibge, cidade: "X", nomeestacao: nome, ultimovalor: 0, datahoraUltimovalor: leitura, acc1hr: "0", acc3hr: "-", acc6hr: "-", acc12hr: "-", acc24hr: "-", acc48hr: "-", acc72hr: "-", acc96hr: "-", tipoestacao: 1, status: 0 });
  const rede = [];
  for (let i = 0; i < 60; i++) rede.push(est(3550308, "Fundo" + i, "30/10/26 15:50"));
  rede.push(est(3509205, "Ponunduva", "30/10/26 16:00"), est(3509205, "RelogioAdiantado", "30/10/26 17:00"));
  const coleta = new Date(Date.UTC(2026, 9, 30, 16, 3));
  const r = montar(rede, coleta);
  assert.equal(r.referenciaRede, "30/10/26 16:00", "o 17:00 está 57 min à frente da coleta (16:03 UTC)");
  assert.equal(r.fusoConfirmado, true);
  assert.equal(r.leiturasFuturas, 1);
  const pon = r.estacoes.find((e) => e.nome === "Ponunduva"), adi = r.estacoes.find((e) => e.nome === "RelogioAdiantado");
  assert.equal(pon.minutosAntes, 0);
  assert.equal(pon.leituraFutura, false);
  assert.equal(adi.leituraFutura, true);
  assert.equal(adi.minutosAntes, -60, "negativo = à frente da referência");
  assert.equal(TOLERANCIA_FUTURO_MIN, 10);
  // sem nenhuma leitura recente coerente com UTC o fuso não é confirmado e vale o comportamento anterior (maior leitura)
  const velha = montar(rede.map((e) => ({ ...e, datahoraUltimovalor: "01/10/26 10:00" })).concat([est(3509205, "Z", "01/10/26 12:00")]), coleta);
  assert.equal(velha.fusoConfirmado, false);
  assert.equal(velha.referenciaRede, "01/10/26 12:00");
});

test("A6. focos do INPE: contagem só nas últimas 24 h e foco sem horário/futuro não conta", () => {
  const agora = Date.UTC(2026, 9, 30, 16, 0);
  const h = (n) => agora - n * 3600000;
  const focos = [
    { ts: h(1), emCajamar: true, distanciaKm: 3 },
    { ts: h(23), emCajamar: false, distanciaKm: 40 },
    { ts: h(25), emCajamar: true, distanciaKm: 2 },   // fora da janela de 24 h
    { ts: h(-2), emCajamar: false, distanciaKm: 10 }, // 2 h à frente: relógio errado
    { ts: null, emCajamar: true, distanciaKm: 1 },
    { ts: h(2), emCajamar: false, distanciaKm: 80 }
  ];
  const c = Queimadas.contarFocos(focos, agora, 24);
  assert.deepEqual([c.total, c.nCajamar, c.nRaio50, c.semHorario], [3, 1, 2, 1]);
  assert.equal(c.maisRecente, h(1));
  assert.equal(c.maisAntigo, h(23));
});

test("A7. Angström: fórmula clássica separada dos ajustes locais; Regra dos 30 e distância conferidas à mão", () => {
  // T = 30 °C, U = 20 %: I = 20/20 + (27 - 30)/10 = 1 - 0,3 = 0,7
  const r = Queimadas.calcularRiscoFogoLocal({ temp: 30, umid: 20, vento: 10, rajada: 10, chuva24h: 0 });
  assert.equal(r.angstromPuro, 0.7);
  assert.equal(r.angstrom, 0.7, "sem chuva e sem vento forte não há ajuste");
  assert.equal(r.adaptado, true);
  assert.match(r.aviso, /não é classificação oficial/);
  // com 5 mm de chuva o sistema soma 1,5 (ajuste local): 2,2; o índice clássico continua 0,7
  const chuva = Queimadas.calcularRiscoFogoLocal({ temp: 30, umid: 20, vento: 10, rajada: 10, chuva24h: 5 });
  assert.equal(chuva.angstrom, 2.2);
  assert.equal(chuva.angstromPuro, 0.7);
  // Regra dos 30 (T >= 30, U <= 30, vento >= 30): 31 °C, 25 %, vento 29 e rajada 35 => 3 fatores (o sistema usa a maior entre vento e rajada)
  assert.equal(Queimadas.calcularRiscoFogoLocal({ temp: 31, umid: 25, vento: 29, rajada: 35, chuva24h: 0 }).regra30, 3);
  assert.equal(Queimadas.calcularRiscoFogoLocal({ temp: 31, umid: 25, vento: 29, rajada: 29, chuva24h: 0 }).regra30, 2);
  // Haversine: 1 grau de latitude = 6371 x pi / 180 = 111,195 km
  assert.ok(Math.abs(Queimadas.distanciaKm(0, 0, 1, 0) - 111.195) < 0.01);
  assert.ok(Math.abs(Queimadas.distanciaKm(-23.35, -46.88, -23.35, -46.88)) < 1e-9);
});

test("A8. comparar.js e climatologia.js usam a definição de dia completo do histórico e não trocam ECMWF por outro modelo", () => {
  const comp = readFileSync(join(RAIZ, "js/comparar.js"), "utf8");
  assert.doesNotMatch(comp, /precipitation_sum_ecmwf_ifs04\s*\|\|\s*resMod\.daily\.precipitation_sum_best_match/);
  assert.doesNotMatch(comp, /1296/);
  assert.match(comp, /Estacao\.diaCompleto/);
  assert.match(comp, /contH\[d\] !== 24/);
  const clim = readFileSync(join(RAIZ, "js/climatologia.js"), "utf8");
  assert.match(clim, /Estacao\.diaCompleto/);
});

test("A9. horários exibidos no painel são sempre de America/Sao_Paulo", () => {
  for (const arq of ["js/painel-base.js", "js/resumo.js", "js/cemaden.js"]) {
    const src = readFileSync(join(RAIZ, arq), "utf8");
    assert.match(src, /timeZone: "America\/Sao_Paulo"/, arq);
  }
});

test("A10. worker/cemaden-proxy.js não contém byte NUL cru", () => {
  assert.equal(readFileSync(join(RAIZ, "worker/cemaden-proxy.js")).includes(0), false);
});
