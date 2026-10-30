// Testes de publicar.js (fluxo de geração e exportação) com DOM, canvas e APIs simulados. Dados FICTÍCIOS; sem internet.
// Cobrem: API indisponível, campos ausentes, zero, dados desatualizados, data não encontrada, série incompleta, INMET e INPE
// (indisponível × sem registro), simulações, falha de desenho, exportação durante a geração, troca de modelo após falha,
// faixa personalizada e textos extensos nos três formatos.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RAIZ } from "./util.mjs";
import { abrirPublicar, climaFixture, avisoFixture, previsaoFixture, FOCOS_OK, esperarTudo, AGORA_MS } from "./auxiliares-publicar.mjs";

const HORA = 3600000;
const tudoOk = (o = {}) => ({
  rotas: { clima: () => climaFixture(), avisos: () => ({ hoje: [], futuro: [] }), previsao: () => previsaoFixture(), ...(o.rotas || {}) },
  focos: o.focos || (() => FOCOS_OK([])),
  offline: true, // uma só tentativa por fonte: testes rápidos
  ...o,
  rotas: { clima: () => climaFixture(), avisos: () => ({ hoje: [], futuro: [] }), previsao: () => previsaoFixture(), ...(o.rotas || {}) }
});
const falha = (msg) => () => { throw new Error(msg); };

async function escolher(amb, tipo, opcao) {
  amb.els.tipo.value = tipo;
  amb.els.tipo.onchange();
  if (opcao !== undefined) { amb.els.escolha.value = opcao; amb.els.escolha.onchange(); }
  await esperarTudo(10);
}
const ultimoTexto = (amb) => amb.cv.chamadas.map((c) => c.txt).join(" | ");

test("1. API meteorológica indisponível: nada é gerado, o motivo aparece e a exportação fica bloqueada", async () => {
  const amb = await abrirPublicar(tudoOk({ rotas: { clima: falha("HTTP 503") } }));
  assert.match(amb.els.fontesPub.textContent, /Open-Meteo \(modelo\): INDISPONÍVEL \(HTTP 503\)/);
  assert.match(amb.els.msg.textContent, /Publicação não gerada: Open-Meteo indisponível \(HTTP 503\)/);
  assert.equal(amb.els.baixar.disabled, true);
  assert.equal(amb.els.compartilhar.disabled, true);
  assert.match(amb.els.metaPrevia.textContent, /Sem prévia válida/);
  assert.ok(amb.textos().some((t) => /Publicação não gerada/.test(t)));
  assert.ok(!amb.textos().some((t) => /NORMAL|SEM AVISO/.test(t)), "nenhuma faixa de normalidade");
  amb.els.baixar.onclick();
  assert.equal(amb.cv.blobsPedidos, 0);
});

test("2. campo meteorológico ausente aparece como “—” (nunca 0, null ou NaN) na arte e na legenda", async () => {
  const f = climaFixture({ omitirDaily: ["precipitation_sum", "precipitation_probability_max", "wind_gusts_10m_max"], hourly: { precipitation_probability: [], relative_humidity_2m: [] } });
  const amb = await abrirPublicar(tudoOk({ rotas: { clima: () => f } }));
  const leg = amb.els.legenda.value;
  assert.match(leg, /Chance de — · Volume previsto: —/);
  assert.match(leg, /Umidade do ar: —/);
  assert.doesNotMatch(leg, /Chance de 0%|Volume previsto: 0/);
  assert.match(leg, /Previsão de chuva incompleta|Dados incompletos/);
  const arte = amb.textos().join("\n");
  assert.doesNotMatch(arte, /\bnull\b|undefined|NaN/);
  assert.ok(amb.textos().some((t) => /^—( · —)?$|— · —/.test(t) || t.includes("—")));
  assert.equal(amb.els.baixar.disabled, false, "com dados parciais ainda é possível publicar, mas sinalizado");
  assert.match(amb.els.legenda.value, /DADOS PARCIAIS/);
});

test("3. valor numérico igual a zero é mostrado como zero (informado), diferente de ausente", async () => {
  const amb = await abrirPublicar(tudoOk());
  assert.match(amb.els.legenda.value, /Chance de 0% · Volume previsto: 0,0 mm/);
  assert.ok(amb.textos().includes("0% · 0,0 mm"));
  assert.match(amb.els.legenda.value, /Baixa chance de chuva \(0%\)|Baixa chance de chuva/);
});

test("4. dados desatualizados: cache além do prazo é identificado; cache de outro dia interrompe a geração", async () => {
  const velhoMesmoDia = { t: AGORA_MS - 5 * HORA, d: climaFixture({ agora: "2026-10-30T09:00" }) };
  const amb = await abrirPublicar(tudoOk({ rotas: { clima: falha("HTTP 500") }, cache: { clima_flyer: velhoMesmoDia } }));
  assert.match(amb.els.fontesPub.textContent, /Open-Meteo \(modelo\): DESATUALIZADO \(última atualização válida 30\/10 09:05\)/);
  assert.match(amb.els.status.textContent, /DESATUALIZADO/);
  assert.match(amb.els.legenda.value, /DESATUALIZADO \(última atualização válida 30\/10 09:05\)/);
  assert.ok(amb.textos().some((t) => /DESATUALIZADO/.test(t)), "a arte também mostra o aviso");

  const ontem = { t: AGORA_MS - 24 * HORA, d: climaFixture({ hoje: "2026-10-29", agora: "2026-10-29T14:00" }) };
  const amb2 = await abrirPublicar(tudoOk({ rotas: { clima: falha("HTTP 500") }, cache: { clima_flyer: ontem } }));
  assert.match(amb2.els.msg.textContent, /Referência temporal inválida: a API retornou dados de 29\/10\/2026, mas hoje em Cajamar/);
  assert.equal(amb2.els.baixar.disabled, true);

  const avisoVelho = { t: AGORA_MS - 9 * HORA, d: { hoje: [avisoFixture()], futuro: [] } };
  const amb3 = await abrirPublicar(tudoOk({ rotas: { avisos: falha("HTTP 502") }, cache: { avisos_inmet: avisoVelho } }));
  await escolher(amb3, "aviso");
  assert.match(amb3.els.msg.textContent, /Avisos do INMET DESATUALIZADOS \(última atualização válida 30\/10 05:05\)/);
  assert.equal(amb3.els.baixar.disabled, true);
});

test("4b. aviso em cache DENTRO do prazo é preservado e identificado como cache", async () => {
  const cache = { t: AGORA_MS - 1800000, d: { hoje: [avisoFixture()], futuro: [] } };
  const amb = await abrirPublicar(tudoOk({ rotas: { avisos: falha("HTTP 502") }, cache: { avisos_inmet: cache } }));
  assert.match(amb.els.fontesPub.textContent, /Avisos INMET: consulta falhou; usando o último dado válido \(30\/10 13:35\)/);
  assert.match(amb.els.textoFaixa.value, /AVISO INMET ATIVO: TEMPESTADE/);
  assert.match(amb.els.legenda.value, /Avisos INMET: 1 ativo\(s\) \(do cache; última atualização válida 30\/10 13:35\)/);
  await escolher(amb, "aviso");
  assert.match(amb.els.legenda.value, /DADO DO CACHE \(última atualização válida 30\/10 13:35\)/);
  assert.match(amb.els.status.textContent, /do cache \(consulta falhou\)/);
  assert.equal(amb.els.baixar.disabled, false);
});

test("5. data atual não encontrada na série: não usa o índice 0, interrompe e informa o motivo", async () => {
  const f = climaFixture();
  f.daily.time = f.daily.time.map((d) => new Date(Date.parse(d + "T12:00:00Z") + 20 * 86400000).toISOString().slice(0, 10));
  const amb = await abrirPublicar(tudoOk({ rotas: { clima: () => f } }));
  assert.match(amb.els.msg.textContent, /não foi encontrada na série diária/);
  assert.equal(amb.els.baixar.disabled, true);
  assert.equal(amb.els.titulo.value, "");
  assert.ok(!amb.textos().some((t) => /\d{2}\/\d{2}$/.test(t) && /·/.test(t) && /FEIRA|SÁBADO|DOMINGO/i.test(t)), "nenhum dia foi desenhado");
});

test("6. série temporal incompleta (lacuna, data ou horário duplicado) interrompe a geração", async () => {
  const lac = climaFixture(); lac.daily.time.splice(10, 1);
  const a1 = await abrirPublicar(tudoOk({ rotas: { clima: () => lac } }));
  assert.match(a1.els.msg.textContent, /série diária com lacuna/);
  const dup = climaFixture(); dup.hourly.time[30] = dup.hourly.time[29];
  const a2 = await abrirPublicar(tudoOk({ rotas: { clima: () => dup } }));
  assert.match(a2.els.msg.textContent, /horário duplicado/);
  assert.equal(a1.els.baixar.disabled && a2.els.baixar.disabled, true);
});

test("7. avisos INMET indisponíveis: nunca viram “sem avisos” nem faixa de normalidade", async () => {
  const amb = await abrirPublicar(tudoOk({ rotas: { avisos: falha("HTTP 500") } }));
  assert.match(amb.els.textoFaixa.value, /AVISOS INMET INDISPONÍVEIS/);
  assert.doesNotMatch(amb.els.textoFaixa.value, /SEM AVISO|NORMAL/);
  assert.ok(amb.textos().some((t) => /AVISOS INMET INDISPONÍVEIS/.test(t)));
  assert.match(amb.els.legenda.value, /Avisos do INMET indisponíveis no momento/);
  await escolher(amb, "aviso");
  assert.match(amb.els.msg.textContent, /indisponível \(HTTP 500\)\. Não é possível afirmar que não há avisos/);
  assert.equal(amb.els.baixar.disabled, true);
});

test("8. consulta INMET válida sem avisos é dito explicitamente, com horário da consulta", async () => {
  const amb = await abrirPublicar(tudoOk());
  assert.match(amb.els.textoFaixa.value, /SEM AVISO INMET \(14:05\)/);
  assert.match(amb.els.fontesPub.textContent, /Avisos INMET: ok · coletado 30\/10 14:05/);
  await escolher(amb, "aviso");
  assert.match(amb.els.msg.textContent, /Consulta válida às 14:05: nenhum aviso ativo do INMET para Cajamar/);
  assert.doesNotMatch(amb.els.msg.textContent, /indisponível/);
  assert.equal(amb.els.baixar.disabled, true, "sem aviso não há o que publicar");
});

test("8b. aviso ativo do INMET: a faixa usa a cor e o texto oficiais e a arte traz fonte e coleta", async () => {
  const amb = await abrirPublicar(tudoOk({ rotas: { avisos: () => ({ hoje: [avisoFixture()], futuro: [] }) } }));
  assert.match(amb.els.textoFaixa.value, /⚠️ AVISO INMET ATIVO: TEMPESTADE/);
  await escolher(amb, "aviso", "0");
  assert.equal(amb.els.baixar.disabled, false);
  assert.match(amb.els.legenda.value, /Fonte: INMET \(aviso oficial\) · aviso · ref\. 30\/10\/2026 · coleta 30\/10 14:05 \(SP\)/);
  const rodape = amb.textos().find((t) => t.startsWith("Fonte: INMET"));
  assert.ok(rodape, "o rodapé da arte mostra a fonte");
});

test("9. consulta INPE indisponível: nunca aparece “0 focos”; a arte e a legenda dizem que a consulta falhou", async () => {
  const cache = { focos_inpe_resumo: { t: AGORA_MS - 2 * HORA, d: { t: AGORA_MS - 2 * HORA, n: 3 } } };
  const amb = await abrirPublicar(tudoOk({ focos: falha("servidor de focos do INPE indisponível"), cache }));
  assert.match(amb.els.fontesPub.textContent, /Focos INPE: CONSULTA INDISPONÍVEL \(servidor de focos do INPE indisponível\) · última atualização válida 30\/10 12:05 \(3 foco\(s\), não é a situação atual\)/);
  await escolher(amb, "flyer_fogo", "0");
  const leg = amb.els.legenda.value;
  assert.match(leg, /INDISPONÍVEL/);
  assert.doesNotMatch(leg, /0 foco|nenhum foco|sem focos/i);
  assert.ok(amb.textos().includes("Indisponível"));
  assert.ok(!amb.textos().some((t) => /^0 foco/.test(t)));
  assert.match(amb.els.status.textContent, /INDISPONÍVEL/);
});

test("10. consulta INPE válida sem focos é “0 focos” com fonte, horário e área; consulta parcial vazia não vale como zero", async () => {
  const amb = await abrirPublicar(tudoOk());
  await escolher(amb, "flyer_fogo", "0");
  assert.match(amb.els.legenda.value, /Consulta INPE válida em 30\/10 14:04 \(SP\): nenhum foco identificado nas últimas 24 h — município de Cajamar\/SP e raio de 50 km/);
  assert.ok(amb.textos().includes("0 focos"));
  assert.ok(amb.textos().includes("Consulta válida · últimas 24 h · INPE 30/10 14:04"));

  const comFocos = await abrirPublicar(tudoOk({ focos: () => FOCOS_OK([{ emCajamar: true, distanciaKm: 2 }, { emCajamar: false, distanciaKm: 30 }]) }));
  await escolher(comFocos, "flyer_fogo", "0");
  assert.ok(comFocos.textos().includes("1 foco(s) em Cajamar"));

  const parcial = await abrirPublicar(tudoOk({ focos: () => Object.assign(FOCOS_OK([]), { parcial: true, arquivosLidos: 1, arquivosTentados: 4 }) }));
  await escolher(parcial, "flyer_fogo", "0");
  assert.match(parcial.els.legenda.value, /INDISPONÍVEL/);
  assert.match(parcial.els.legenda.value, /1 de 4 arquivos/);
  assert.doesNotMatch(parcial.els.legenda.value, /nenhum foco identificado/);
});

test("10b. risco de fogo sem todos os dados meteorológicos: “DADOS INSUFICIENTES” (sem umidade inventada)", async () => {
  const f = climaFixture({ hourly: { relative_humidity_2m: [] } });
  const amb = await abrirPublicar(tudoOk({ rotas: { clima: () => f } }));
  await escolher(amb, "flyer_fogo", "0");
  assert.equal(amb.els.titulo.value, "RISCO DE FOGO: DADOS INSUFICIENTES");
  assert.match(amb.els.legenda.value, /Indicador de Risco Meteorológico \(calculado, não oficial\): DADOS INSUFICIENTES/);
  assert.doesNotMatch(amb.els.legenda.value, /MODERADO|ALTO|BAIXO/);
  assert.doesNotMatch(ultimoTexto(amb), /Regra dos 30: \d/);
});

test("11. simulação nunca é apresentada como monitoramento real: marca d'água, legenda e bloqueio de compartilhamento", async () => {
  const amb = await abrirPublicar(tudoOk());
  await escolher(amb, "flyer_deslizamento", "sim:3");
  assert.match(amb.els.legenda.value, /^🧪 SIMULAÇÃO — NÃO É MONITORAMENTO REAL/);
  assert.doesNotMatch(amb.els.legenda.value, /#DefesaCivil/);
  assert.match(amb.els.titulo.value, /^SIMULAÇÃO · /);
  assert.ok(amb.textos().includes("SIMULAÇÃO"));
  assert.ok(amb.textos().includes("NÃO É MONITORAMENTO REAL"));
  assert.match(amb.els.metaPrevia.textContent, /SIMULAÇÃO/);
  assert.equal(amb.els.baixar.disabled, false);
  assert.equal(amb.els.compartilhar.disabled, true);
  assert.equal(amb.els.copiar.disabled, true);
  assert.equal(amb.els.copiarImg.disabled, true);
  amb.els.compartilhar.onclick();
  amb.els.copiar.onclick();
  await esperarTudo(10);
  assert.equal(amb.cv.blobsPedidos, 0);
  assert.deepEqual(amb.compartilhamentos, []);
  assert.match(amb.els.msg.textContent, /SIMULAÇÃO/);
  amb.els.baixar.onclick();
  assert.equal(amb.cv.blobsPedidos, 1, "o PNG com marca d'água pode ser baixado");
});

test("11b. deslizamento: série completa gera o indicador do modelo; com horas faltando mostra “DADOS INSUFICIENTES PARA AVALIAÇÃO”; aviso obrigatório na arte", async () => {
  const aviso = "Indicadores pluviométricos de referência. Não substituem vistoria técnica, avaliação de campo ou decisão da autoridade competente.";
  const completo = await abrirPublicar(tudoOk());
  await escolher(completo, "flyer_deslizamento", "serie:atual");
  assert.equal(completo.els.titulo.value, "INDICADOR REFERENCIAL: REFERENCIAL 0");
  assert.ok(completo.els.legenda.value.includes("estimativa de modelo (não é medição)"));
  assert.match(completo.els.legenda.value, /Fonte: Open-Meteo/);
  assert.ok(completo.els.legenda.value.includes(aviso));
  assert.ok(completo.els.linhas.value.includes(aviso), "o aviso entra na arte");
  assert.ok(completo.textos().some((t) => t.includes("Indicadores pluviométricos de referência")), "o aviso é desenhado no canvas");

  const f = climaFixture();
  f.hourly.precipitation[7 * 24 + 14 - 5] = null; // uma hora sem dado na janela de 24 h
  const furo = await abrirPublicar(tudoOk({ rotas: { clima: () => f } }));
  await escolher(furo, "flyer_deslizamento", "serie:atual");
  assert.equal(furo.els.titulo.value, "DADOS INSUFICIENTES PARA AVALIAÇÃO");
  assert.match(furo.els.textoFaixa.value, /DADOS INSUFICIENTES PARA AVALIAÇÃO/);
  assert.match(furo.els.linhas.value, /DADOS INSUFICIENTES PARA AVALIAÇÃO. /);
  assert.doesNotMatch(furo.els.legenda.value, /REFERENCIAL 0/);
  assert.ok(furo.textos().some((t) => /DADOS INSUFICIENTES PARA AVALIAÇÃO/.test(t)));

  const proj = await abrirPublicar(tudoOk());
  await escolher(proj, "flyer_deslizamento", "serie:proj");
  assert.ok(proj.els.legenda.value.includes("previsão do modelo (não é medição)"), "previsão separada de medição");
});

test("12. falha na geração da imagem: nada é exportável, a prévia antiga some e a mensagem é específica", async () => {
  const amb = await abrirPublicar(tudoOk({ falharEmTexto: "SEXTA-FEIRA" }));
  assert.match(amb.els.msg.textContent, /Publicação não gerada: erro ao desenhar a imagem \(falha simulada ao desenhar\)/);
  assert.equal(amb.els.baixar.disabled, true);
  assert.equal(amb.els.compartilhar.disabled, true);
  assert.equal(amb.els.copiarImg.disabled, true);
  assert.equal(amb.els.copiar.disabled, true);
  assert.equal(amb.els.titulo.value, "", "campos limpos");
  assert.ok(amb.textos().at(-1).includes("Publicação não gerada") || amb.textos().some((t) => /Publicação não gerada/.test(t)));
  amb.els.baixar.onclick(); amb.els.compartilhar.onclick(); amb.els.copiarImg.onclick();
  await esperarTudo(10);
  assert.equal(amb.cv.blobsPedidos, 0);
});

test("13. tentativa de exportar durante o processamento é recusada", async () => {
  const amb = await abrirPublicar(tudoOk({ pendenteClima: true }));
  await escolher(amb, "flyer_5dias");
  assert.equal(amb.els.baixar.disabled, true);
  amb.els.baixar.onclick();
  amb.els.compartilhar.onclick();
  await esperarTudo(10);
  assert.match(amb.els.msg.textContent, /ainda está sendo gerada/);
  assert.equal(amb.cv.blobsPedidos, 0);
  assert.match(amb.els.metaPrevia.textContent, /gerando/);
});

test("13b. a prévia mudar durante a exportação cancela o arquivo", async () => {
  const amb = await abrirPublicar(tudoOk());
  const original = amb.cv.canvas.toBlob;
  amb.cv.canvas.toBlob = (cb) => { amb.els.tipo.value = "dica"; amb.els.tipo.onchange(); original(cb); };
  amb.els.baixar.onclick();
  assert.match(amb.els.msg.textContent, /A prévia mudou durante a exportação/);
});

test("14. mudança de modelo após falha: a imagem antiga não volta; o novo modelo gera e exporta normalmente", async () => {
  const amb = await abrirPublicar(tudoOk());
  assert.equal(amb.els.baixar.disabled, false);
  assert.match(amb.els.metaPrevia.textContent, /Panfleto Diário/);

  amb.cv.limpar();
  await escolher(amb, "aviso"); // sem aviso: falha
  assert.equal(amb.els.baixar.disabled, true);
  assert.ok(!amb.textos().some((t) => /SEXTA-FEIRA/.test(t)), "o panfleto anterior não é redesenhado");
  assert.equal(amb.els.titulo.value, "");
  amb.els.baixar.onclick(); amb.els.copiarImg.onclick();
  await esperarTudo(10);
  assert.equal(amb.cv.blobsPedidos, 0);

  await escolher(amb, "dica");
  assert.equal(amb.els.baixar.disabled, false);
  assert.match(amb.els.metaPrevia.textContent, /Dica de prevenção/);
  amb.els.baixar.onclick();
  assert.equal(amb.cv.blobsPedidos, 1);
  assert.match(amb.els.msg.textContent, /Panfleto baixado/);

  await escolher(amb, "aviso");
  assert.equal(amb.els.baixar.disabled, true);
  // o feedback do botão não pode reabilitá-lo depois da falha
  await new Promise((r) => setTimeout(r, 2100));
  assert.equal(amb.els.baixar.disabled, true);
});

test("15. faixa personalizada: marcada como do operador; cor e texto incoerentes exigem justificativa visível", async () => {
  const amb = await abrirPublicar(tudoOk());
  amb.els.nivelFaixa.value = "normal";
  amb.els.textoFaixa.value = "🚨 EMERGÊNCIA: EVACUAÇÃO IMEDIATA";
  amb.els.nivelFaixa.onchange();
  assert.equal(amb.els.baixar.disabled, true);
  assert.match(amb.els.msg.textContent, /Faixa incoerente \(cor de normalidade com texto de alerta\/emergência\)/);
  amb.els.baixar.onclick();
  assert.equal(amb.cv.blobsPedidos, 0);
  assert.ok(amb.textos().some((t) => t === "FAIXA DEFINIDA PELO OPERADOR"));

  amb.els.justificativaFaixa.value = "exercício simulado aprovado pela coordenação";
  amb.els.justificativaFaixa.oninput();
  assert.equal(amb.els.baixar.disabled, false);
  assert.ok(amb.textos().some((t) => t === "FAIXA DEFINIDA PELO OPERADOR · Justificativa: exercício simulado aprovado pela coordenação"));
  amb.els.baixar.onclick();
  assert.equal(amb.cv.blobsPedidos, 1);

  // aviso oficial + operador marca verde de normalidade
  const comAviso = await abrirPublicar(tudoOk({ rotas: { avisos: () => ({ hoje: [avisoFixture()], futuro: [] }) } }));
  comAviso.els.nivelFaixa.value = "normal";
  comAviso.els.nivelFaixa.onchange();
  assert.equal(comAviso.els.baixar.disabled, true);

  // só trocar o texto (sem mudar a cor) também é marcado como alteração do operador
  const so = await abrirPublicar(tudoOk());
  so.els.textoFaixa.value = "Previsão revisada pela equipe";
  so.els.textoFaixa.oninput();
  assert.ok(so.textos().some((t) => t === "FAIXA DEFINIDA PELO OPERADOR"));
  assert.equal(so.els.baixar.disabled, false);
});

const FORMATOS = { stories: [1080, 1920], retrato: [1080, 1350], feed: [1080, 1080] };
const LONGO = "Texto muito extenso de orientação à população de Cajamar sobre cuidados durante o período de chuvas e vendavais ".repeat(4);

test("16. textos extensos nos três formatos: nada sai do canvas e o conteúdo excedente é cortado com aviso", async () => {
  for (const [fmt, [W, H]] of Object.entries(FORMATOS)) {
    for (const [tipo, opcao] of [["dica", "Chuva forte"], ["flyer_dia", "0"], ["flyer_5dias", undefined], ["flyer_fogo", "0"], ["flyer_deslizamento", "sim:2"], ["aviso", "0"]]) {
      const amb = await abrirPublicar(tudoOk({ rotas: { avisos: () => ({ hoje: [avisoFixture({ descricao: "Tempestade com granizo e ventos intensos em todo o município", riscos: JSON.stringify([LONGO]), instrucoes: JSON.stringify([LONGO, LONGO, LONGO, LONGO]) })], futuro: [] }) } }));
      amb.els.formato.value = fmt;
      amb.els.formato.onchange();
      await escolher(amb, tipo, opcao);
      const rot = `${fmt}/${tipo}`;
      assert.equal(amb.els.baixar.disabled, false, rot + ": gerou");
      amb.els.titulo.value = LONGO; amb.els.titulo.oninput();
      amb.els.subtitulo.value = LONGO; amb.els.subtitulo.oninput();
      amb.els.linhas.value = Array.from({ length: 30 }, (_, i) => `${i + 1}. ` + LONGO).join("\n"); amb.els.linhas.oninput();
      amb.els.contato.value = "(11) 4446-0199 · plantão 24 horas"; amb.els.contato.oninput();
      amb.cv.limpar();
      amb.els.textoFaixa.value = "INFORMATIVO " + LONGO; amb.els.textoFaixa.oninput();
      assert.equal(amb.cv.canvas.width, W, rot);
      assert.equal(amb.cv.canvas.height, H, rot);
      const medir = (c) => { const m = /(\d+)px/.exec(c.font); return c.txt.length * (m ? +m[1] : 10) * 0.52; };
      const marca = new Set(["SIMULAÇÃO", "NÃO É MONITORAMENTO REAL"]);
      amb.cv.chamadas.filter((c) => !marca.has(c.txt)).forEach((c) => {
        const w = medir(c);
        assert.ok(c.y >= 0 && c.y <= H - 4, `${rot}: "${c.txt.slice(0, 40)}" fora na vertical (y=${c.y}, H=${H})`);
        if (c.align === "center") assert.ok(c.x - w / 2 >= 20 && c.x + w / 2 <= W - 20, `${rot}: centro "${c.txt.slice(0, 40)}" ultrapassa a largura (${Math.round(w)}px)`);
        else if (c.align === "right") assert.ok(c.x - w >= 20, `${rot}: direita "${c.txt.slice(0, 40)}" ultrapassa a margem`);
        else assert.ok(c.x + w <= W - 20, `${rot}: "${c.txt.slice(0, 40)}" ultrapassa a margem direita (${Math.round(c.x + w)} > ${W - 20})`);
      });
      const todos = amb.textos().join("\n");
      assert.ok(amb.textos().some((t) => /^Fonte: /.test(t)), rot + ": rodapé de fonte presente");
      assert.ok(/Emitido/.test(todos) && /\(SP\)/.test(todos), rot + ": data de emissão em SP");
      assert.ok(/EMERGÊNCIA: DEFESA CIVIL 199/.test(todos), rot + ": faixa de emergência presente");
      assert.ok(/…/.test(todos), rot + ": o excesso foi cortado com reticências");
      assert.doesNotMatch(todos, /\bnull\b|undefined|NaN/, rot);
    }
  }
});

test("rastreabilidade: a arte informa fonte, natureza, referência, coleta e estado; legenda repete o rastro", async () => {
  const amb = await abrirPublicar(tudoOk());
  const iRod = amb.textos().findIndex((t) => t.startsWith("Fonte: Open-Meteo"));
  assert.ok(iRod >= 0, "rodapé com a fonte");
  const rod = amb.textos().slice(iRod, iRod + 3).join(" ");
  assert.match(rod, /previsão do modelo/);
  assert.match(rod, /ref\. 30\/10\/2026/);
  assert.match(rod, /coleta 30\/10 14:05 \(SP\)/);
  assert.match(amb.els.legenda.value, /Fonte: Open-Meteo \(modelo numérico\) · previsão do modelo · ref\. 30\/10\/2026 · coleta 30\/10 14:05 \(SP\)/);
  assert.match(amb.els.metaPrevia.textContent, /Panfleto Diário · referência 30\/10\/2026 · Stories 9:16 · gerada 30\/10 14:05 \(SP\)/);
});

test("fuso: 23:30 em São Paulo (já 31/10 em UTC) gera o dia 30/10 e o horário local", async () => {
  const noite = Date.UTC(2026, 9, 31, 2, 30);
  const amb = await abrirPublicar(tudoOk({ agoraMs: noite, rotas: { clima: () => climaFixture({ agora: "2026-10-30T23:30" }) } }));
  assert.equal(amb.els.titulo.value, "SEXTA-FEIRA · 30/10");
  assert.match(amb.els.metaPrevia.textContent, /referência 30\/10\/2026/);
  assert.match(amb.els.status.textContent, /30\/10 23:30/);
});

test("nomes de arquivo trazem o modelo, a data de referência e a hora da geração (não a hora do aparelho)", async () => {
  const amb = await abrirPublicar(tudoOk());
  const nomes = [];
  amb.document.createElement = () => { const e = { dataset: {}, style: {}, click() { nomes.push(this.download); }, remove() {} }; return e; };
  amb.els.baixar.onclick();
  assert.deepEqual(nomes, ["story-flyer_dia-20261030-1405.png"]);
});

test("segurança: dados externos só entram por textContent/canvas (sem innerHTML nem eval) e não há catch vazio em publicar.js/publicacao.js/fontes.js", () => {
  for (const arq of ["js/publicar.js", "js/publicacao.js", "js/fontes.js"]) {
    const src = readFileSync(join(RAIZ, arq), "utf8");
    assert.doesNotMatch(src, /catch\s*\(\s*\w+\s*\)\s*\{\s*\}/, arq + ": catch vazio");
    assert.doesNotMatch(src, /\.catch\(function\s*\(\s*\)\s*\{\s*\}\)/, arq + ": .catch vazio");
    assert.doesNotMatch(src, /\beval\(|new Function\(|document\.write/, arq);
  }
  const pub = readFileSync(join(RAIZ, "js/publicar.js"), "utf8");
  const usos = [...pub.matchAll(/\.innerHTML\s*=/g)].length;
  assert.equal(usos, 2, "só feedbackBotao usa innerHTML (texto fixo do botão e restauração do original)");
  assert.doesNotMatch(pub, /innerHTML\s*\+=|insertAdjacentHTML/);
  assert.doesNotMatch(pub, /(?:chuvaMm|probChuva|ventoMax|rajadaMax|precipitation_sum|wind_speed_10m_max)[^\n]*\|\| 0\b/, "ausente não vira 0");
  assert.doesNotMatch(pub, /indiceDiaHojeOM|return idx >= 0 \? idx : 0/, "sem fallback para o índice 0");
  assert.doesNotMatch(pub, /\.n\s*<\s*1296/, "dia completo vem de Estacao.diaCompleto (mesma definição do histórico)");
  assert.doesNotMatch(pub, /umid\s*:\s*[^,\n]*:\s*(40|45)\b/, "sem umidade padrão inventada");
  assert.doesNotMatch(pub, /new Date\(\)\.get(Hours|Date|Month|FullYear)|getTimezoneOffset/, "datas e horas vêm de America/Sao_Paulo, não do aparelho");
});
