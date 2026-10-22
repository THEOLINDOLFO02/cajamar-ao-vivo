// Testes da comparação com o normal de 30 anos (js/climatologia.js). Os dados abaixo são FICTÍCIOS, criados só para testar o código.
import test from "node:test";
import assert from "node:assert/strict";
import { carregarScript } from "./util.mjs";

const { Clim } = carregarScript("js/climatologia.js");

function iso(n) { return Clim.isoDeDia(n); }

// Série diária de 1991-01-01 até "fim". regra(data) devolve os mm do dia (null = sem dado).
function resposta(fim, regra, inicio = "1991-01-01") {
  const time = [], precipitation_sum = [];
  for (let n = Clim.diaDeISO(inicio); n <= Clim.diaDeISO(fim); n++) { const d = iso(n); time.push(d); precipitation_sum.push(regra(d)); }
  return { daily: { time, precipitation_sum } };
}
// Em outubro de cada ano de 1991 a 2020 chove (ano-1990)*0,1 mm por dia; em 2026 chove 1 mm por dia; fora de outubro, nada.
function regraOutubro(d) {
  const [a, m] = d.split("-").map(Number);
  if (m !== 10) return 0;
  return a >= 1991 && a <= 2020 ? Math.round((a - 1990) * 10) / 100 : 1;
}

test("serieDeResposta: guarda décimos de mm e marca dias sem dado", () => {
  const s = Clim.serieDeResposta({ daily: { time: ["2026-10-01", "2026-10-02", "2026-10-03"], precipitation_sum: [1.26, null, 0] } });
  assert.deepEqual([...s.v], [13, -1, 0]);
  assert.equal(Clim.valorDia(s, s.ini), 1.3);
  assert.equal(Clim.valorDia(s, s.ini + 1), null);
  assert.equal(Clim.valorDia(s, s.ini + 99), null, "fora da série");
});

test("serieDeResposta: recusa formato inesperado ou dias que não são seguidos", () => {
  assert.equal(Clim.serieDeResposta(null), null);
  assert.equal(Clim.serieDeResposta({ daily: { time: [], precipitation_sum: [] } }), null);
  assert.equal(Clim.serieDeResposta({ daily: { time: ["2026-10-01", "2026-10-03"], precipitation_sum: [1, 2] } }), null);
  assert.equal(Clim.serieDeResposta({ daily: { time: ["2026-10-01"], precipitation_sum: [1, 2] } }), null);
});

test("somar: dia faltando torna a soma null (nunca completa com zero)", () => {
  const s = Clim.serieDeResposta({ daily: { time: ["2026-10-01", "2026-10-02", "2026-10-03"], precipitation_sum: [1, null, 2] } });
  assert.equal(Clim.somar(s, s.ini, s.ini + 2), null);
  assert.equal(Clim.somar(s, s.ini + 2, s.ini + 2), 2);
});

test("janelaDoAno: mês vai do dia 1 até o mesmo dia; 29/02 vira 28/02 em ano não bissexto", () => {
  const [a, b] = Clim.janelaDoAno("mes", 0, 2023, 2, 29);
  assert.equal(iso(a), "2023-02-01");
  assert.equal(iso(b), "2023-02-28");
  const [c, d] = Clim.janelaDoAno("dias", 30, 2026, 10, 21);
  assert.equal(iso(c), "2026-09-22");
  assert.equal(iso(d), "2026-10-21");
});

test("comparar: total atual, média, posição entre os 30 anos e classificação", () => {
  const s = Clim.serieDeResposta(resposta("2026-10-21", regraOutubro));
  const r = Clim.comparar(s, "2026-10-21", "mes", 0);
  assert.equal(r.atual, 21);
  assert.equal(r.anos, 30);
  assert.ok(Math.abs(r.media - 32.55) < 0.06, "média " + r.media);
  assert.equal(r.pctDaMedia, 65);
  assert.equal(r.min, 2.1);
  assert.equal(r.max, 63);
  assert.equal(r.anosComMenosChuva, 9, "anos de 1991 a 1999 tiveram menos de 21 mm; 2000 empata com 21");
  assert.equal(r.classe.nome, "Abaixo do normal");
  assert.equal(r.inicio, "2026-10-01");
  assert.equal(r.fim, "2026-10-21");
});

test("comparar: janela de 30 dias usa os mesmos 30 dias terminando no mesmo dia de cada ano", () => {
  const s = Clim.serieDeResposta(resposta("2026-10-21", regraOutubro));
  const r = Clim.comparar(s, "2026-10-21", "dias", 30);
  assert.equal(r.atual, 21, "só os 21 dias de outubro têm chuva dentro dos 30 dias");
  assert.equal(r.inicio, "2026-09-22");
});

test("comparar: poucos anos de histórico não geram comparação (devolve null)", () => {
  const s = Clim.serieDeResposta(resposta("2026-10-21", regraOutubro, "2010-01-01"));
  assert.equal(Clim.comparar(s, "2026-10-21", "mes", 0), null);
});

test("comparar: dia faltando no período atual devolve null", () => {
  const s = Clim.serieDeResposta(resposta("2026-10-21", (d) => (d === "2026-10-10" ? null : regraOutubro(d))));
  assert.equal(Clim.comparar(s, "2026-10-21", "mes", 0), null);
});

test("classe: limites dos quintis", () => {
  const nomes = [[0, "Bem abaixo do normal"], [0.19, "Bem abaixo do normal"], [0.2, "Abaixo do normal"], [0.4, "Próximo do normal"], [0.6, "Acima do normal"], [0.8, "Bem acima do normal"], [1, "Bem acima do normal"]];
  for (const [r, nome] of nomes) assert.equal(Clim.classe(r).nome, nome, "rank " + r);
  assert.equal(Clim.classe(null), null);
  assert.equal(Clim.classe(NaN), null);
});

test("posicao: empates contam metade", () => {
  const p = Clim.posicao(5, [1, 5, 5, 9]);
  assert.equal(p.menos, 1);
  assert.equal(p.rank, (1 + 1) / 4);
});

test("conferir: só conta dias completos da estação (1296 leituras ou mais) e exige pelo menos 7", () => {
  const s = Clim.serieDeResposta(resposta("2026-10-21", () => 2));
  const estacao = {};
  for (let d = 1; d <= 10; d++) estacao[`2026-10-${String(d).padStart(2, "0")}`] = { n: 1440, chuva: 1 };
  estacao["2026-10-05"] = { n: 700, chuva: 50 };       // incompleto: ignorado
  const r = Clim.conferir(s, estacao, "2026-10-21", 60);
  assert.equal(r.dias, 9);
  assert.equal(r.modelo, 18);
  assert.equal(r.estacao, 9);
  assert.equal(r.difPct, 100);
  const poucos = { "2026-10-01": { n: 1440, chuva: 1 }, "2026-10-02": { n: 1440, chuva: 1 } };
  assert.equal(Clim.conferir(s, poucos, "2026-10-21", 60), null);
});

test("ultimoDiaComDado: ignora os dias nulos no fim", () => {
  const s = Clim.serieDeResposta({ daily: { time: ["2026-10-01", "2026-10-02", "2026-10-03"], precipitation_sum: [1, 2, null] } });
  assert.equal(iso(Clim.ultimoDiaComDado(s)), "2026-10-02");
});

test("a consulta pede o período 1991 até a data final, só a chuva diária, em fuso de São Paulo", () => {
  const u = Clim.urlArquivo("2026-10-21");
  assert.ok(u.includes("start_date=1991-01-01") && u.includes("end_date=2026-10-21") && u.includes("daily=precipitation_sum") && u.includes("America%2FSao_Paulo"));
});
