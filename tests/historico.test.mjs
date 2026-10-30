// Testes de js/historico.js (importação de CSV, cotas e restauração de backup) com um DOM mínimo simulado.
// Dados FICTÍCIOS. Verificam o comportamento da interface: limites, relatório, concorrência e preservação dos dados.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { join } from "node:path";
import { RAIZ } from "./util.mjs";
import { criarStorage, criarAmbienteHistorico, arquivoFalso, esperar, gerarCsvChuva } from "./auxiliares.mjs";

function abrirHistorico(storage) {
  const amb = criarAmbienteHistorico(storage);
  for (const f of ["js/estacao.js", "js/deslizamento.js", "js/historico.js"]) {
    runInNewContext(readFileSync(join(RAIZ, f), "utf8"), amb.ctx, { filename: f });
  }
  return amb;
}

const csvOk = (o) => gerarCsvChuva({ horas: 48, ...o });

test("página abre sem dados e com dado ilegível avisa sem apagar o original", () => {
  const vazio = abrirHistorico(criarStorage());
  assert.ok(vazio.ctx.Estacao, "a página carrega sem dados e sem erro");
  const st = criarStorage({ "cajamar:estacoes:v2": "{ilegivel" });
  const amb = abrirHistorico(st);
  assert.match(amb.els.aviso.textContent, /ilegíveis/);
  assert.equal(st.getItem("cajamar:estacoes:v2"), "{ilegivel", "nada é sobrescrito só por abrir a página");
});

test("importação com mais de 4 arquivos é recusada por inteiro e não altera o histórico", async () => {
  const st = criarStorage();
  const amb = abrirHistorico(st);
  const arqs = Array.from({ length: 5 }, (_, i) => arquivoFalso("e" + i + ".csv", csvOk()));
  amb.els.arquivo.onchange.call({ files: arqs, value: "x" });
  await esperar();
  assert.match(amb.els.aviso.textContent, /no máximo 4/);
  assert.equal(amb.els.aviso.className.includes("ruim"), true);
  assert.equal(st.escritas, 0);
});

test("importação mista: válidos entram, inválidos são rejeitados com motivo e o relatório lista cada arquivo", async () => {
  const st = criarStorage();
  const amb = abrirHistorico(st);
  const arqs = [
    arquivoFalso("estacao1.csv", csvOk()),
    arquivoFalso("estacao2.csv", csvOk({ nome: "Estação B", sn: "2" })),
    arquivoFalso("lixo.csv", "PK\u0003\u0004\u0000\u0000zip"),
    arquivoFalso("falta-colunas.csv", "a;b\n1;2"),
  ];
  amb.els.arquivo.onchange.call({ files: arqs, value: "x" });
  await esperar();
  const t = amb.els.aviso.textContent;
  assert.match(t, /importados: 2, rejeitados: 2/);
  assert.match(t, /✖ lixo\.csv: .*binário/);
  assert.match(t, /✖ falta-colunas\.csv: colunas ausentes/);
  const banco = JSON.parse(st.getItem("cajamar:estacoes:v2"));
  assert.equal(Object.keys(banco.slots.est1.dias).length, 2);
  assert.equal(Object.keys(banco.slots.est2.dias).length, 2);
});

test("importação sem nenhum arquivo válido não grava e preserva o histórico existente", async () => {
  const st = criarStorage();
  const amb = abrirHistorico(st);
  amb.els.arquivo.onchange.call({ files: [arquivoFalso("e1.csv", csvOk())], value: "x" });
  await esperar();
  const antes = JSON.stringify(st.dados);
  const escritasAntes = st.escritas;
  amb.els.arquivo.onchange.call({ files: [arquivoFalso("ruim.csv", "a;b\n1;2"), arquivoFalso("outro.txt", csvOk())], value: "x" });
  await esperar();
  assert.match(amb.els.aviso.textContent, /importados: 0, rejeitados: 2/);
  assert.equal(JSON.stringify(st.dados), antes);
  assert.equal(st.escritas, escritasAntes);
});

test("falha de leitura de um arquivo é relatada e não impede os demais", async () => {
  const st = criarStorage();
  const amb = abrirHistorico(st);
  const quebrado = arquivoFalso("quebrado.csv", "");
  quebrado.__erro = "NotReadableError";
  amb.els.arquivo.onchange.call({ files: [arquivoFalso("ok.csv", csvOk()), quebrado], value: "x" });
  await esperar();
  assert.match(amb.els.aviso.textContent, /importados: 1, rejeitados: 1/);
  assert.match(amb.els.aviso.textContent, /falha na leitura do arquivo: NotReadableError/);
});

test("duas importações simultâneas: a segunda é recusada e nada fica inconsistente", async () => {
  const st = criarStorage();
  const amb = abrirHistorico(st);
  amb.els.arquivo.onchange.call({ files: [arquivoFalso("a.csv", csvOk())], value: "x" });
  amb.els.arquivo.onchange.call({ files: [arquivoFalso("b.csv", csvOk({ nome: "Outra", sn: "9" }))], value: "x" });
  await esperar();
  const banco = JSON.parse(st.getItem("cajamar:estacoes:v2"));
  assert.equal(Object.keys(banco.slots.est1.dias).length, 2);
  assert.equal(Object.keys(banco.slots.est2.dias).length, 0, "o segundo arquivo não foi processado");
  // depois de terminar, uma nova importação volta a funcionar
  amb.els.arquivo.onchange.call({ files: [arquivoFalso("c.csv", csvOk({ nome: "Outra", sn: "9" }))], value: "x" });
  await esperar();
  assert.equal(Object.keys(JSON.parse(st.getItem("cajamar:estacoes:v2")).slots.est2.dias).length, 2);
});

test("falha ao gravar: importação não é anunciada como concluída e o histórico anterior continua", async () => {
  const st = criarStorage();
  const amb = abrirHistorico(st);
  amb.els.arquivo.onchange.call({ files: [arquivoFalso("a.csv", csvOk())], value: "x" });
  await esperar();
  const antes = JSON.stringify(st.dados);
  const orig = st.setItem.bind(st);
  st.setItem = () => { throw new Error("QuotaExceededError simulado"); };
  amb.els.arquivo.onchange.call({ files: [arquivoFalso("b.csv", csvOk({ nome: "Outra", sn: "9" }))], value: "x" });
  await esperar();
  st.setItem = orig;
  assert.match(amb.els.aviso.textContent, /Importação não realizada/);
  assert.match(amb.els.aviso.textContent, /preservados/);
  assert.equal(JSON.stringify(st.dados), antes);
  assert.doesNotMatch(amb.els.aviso.textContent, /importados: 1/);
});

test("cotas inválidas mostram o erro e mantêm as cotas anteriores; válidas são salvas como não homologadas", () => {
  const st = criarStorage();
  const amb = abrirHistorico(st);
  const btn = amb.els.btnSalvarCotasRio;
  ["cotaAtencaoM", "cotaAlertaM", "cotaTransbordoM", "cotaPonto"].forEach((id) => amb.document.getElementById(id));
  amb.els.cotaAtencaoM.value = "";
  amb.els.cotaAlertaM.value = "2.3";
  amb.els.cotaTransbordoM.value = "2.8";
  btn.onclick.call(btn);
  assert.match(amb.els.aviso.textContent, /Atenção \(m\): vazio/);
  assert.equal(st.getItem("cajamar:cotas_rio:v1"), null, "não troca por padrão nem grava");

  amb.els.cotaAtencaoM.value = "3";
  btn.onclick.call(btn);
  assert.match(amb.els.aviso.textContent, /ordem inválida/);
  assert.equal(st.getItem("cajamar:cotas_rio:v1"), null);

  amb.els.cotaAtencaoM.value = "1.9";
  amb.els.cotaPonto.value = "Régua X";
  btn.onclick.call(btn);
  assert.match(amb.els.aviso.textContent, /sem homologação técnica documentada/);
  const salvo = JSON.parse(st.getItem("cajamar:cotas_rio:v1"));
  assert.equal(salvo.atencaoM, 1.9);
  assert.equal(salvo.homologada, false);
  assert.equal(salvo.pontoMedicao, "Régua X");
});

test("restaurar backup inválido não altera nada e informa; backup válido é restaurado por completo", async () => {
  const origem = criarStorage();
  const a0 = abrirHistorico(origem);
  a0.els.arquivo.onchange.call({ files: [arquivoFalso("a.csv", csvOk())], value: "x" });
  await esperar();
  const ver = JSON.parse(JSON.stringify(a0.ctx.Estacao.gerarBackupCompleto(origem)));

  const st = criarStorage({ "cajamar:contato": "199" });
  const amb = abrirHistorico(st);
  const antes = JSON.stringify(st.dados);
  const input = amb.els.arqBackupTudoHist;

  input.onchange.call({ files: [arquivoFalso("b.json", "{nao e json")], value: "x" });
  await esperar();
  assert.match(amb.els.aviso.textContent, /Backup NÃO restaurado|não é um JSON válido/);
  assert.equal(amb.els.aviso.className.includes("ruim"), true);
  assert.equal(JSON.stringify(st.dados), antes);

  input.onchange.call({ files: [arquivoFalso("b.json", JSON.stringify({ ...ver, versao: 7 }))], value: "x" });
  await esperar();
  assert.match(amb.els.aviso.textContent, /versão/);
  assert.equal(JSON.stringify(st.dados), antes);

  input.onchange.call({ files: [arquivoFalso("b.json", JSON.stringify(ver))], value: "x" });
  await esperar();
  assert.match(amb.els.aviso.textContent, /Backup restaurado por completo: 1 equipamento/);
  assert.equal(amb.els.aviso.className.includes("ruim"), false);
  assert.equal(Object.keys(JSON.parse(st.getItem("cajamar:estacoes:v2")).slots.est1.dias).length, 2);
});

test("restauração que falha na gravação é revertida e NÃO é anunciada como sucesso", async () => {
  const origem = criarStorage();
  const a0 = abrirHistorico(origem);
  a0.els.arquivo.onchange.call({ files: [arquivoFalso("a.csv", csvOk())], value: "x" });
  await esperar();
  const ver = JSON.parse(JSON.stringify(a0.ctx.Estacao.gerarBackupCompleto(origem)));
  const st = criarStorage({}, { falharNaEscrita: 2 });
  const amb = abrirHistorico(st);
  amb.els.arqBackupTudoHist.onchange.call({ files: [arquivoFalso("b.json", JSON.stringify(ver))], value: "x" });
  await esperar();
  assert.match(amb.els.aviso.textContent, /Restauração revertida/);
  assert.doesNotMatch(amb.els.aviso.textContent, /restaurado por completo/);
  assert.equal(Object.keys(st.dados).length, 0);
});
