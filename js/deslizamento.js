// Critério REFERENCIAL de chuva para deslizamento de terra em Cajamar/SP.
// ATENÇÃO: os limiares abaixo vêm de Pinheiro et al. (2005) e AlertaRio (2013), calibrados para o Rio de Janeiro.
// NÃO foram homologados pela Defesa Civil de Cajamar e NÃO são classificação oficial de risco. Servem apenas
// como indicador pluviométrico de apoio; nenhuma decisão de evacuação ou interdição pode decorrer deles.
// Dado ausente permanece ausente (null): nunca vira 0 mm. Janela incompleta não gera classificação conclusiva.
// Sem dependência de DOM nas funções de cálculo (pode ser testado no Node).
(function (w) {
  "use strict";

  var AVISO_CRITERIO = "Critério referencial NÃO homologado pela Defesa Civil de Cajamar (limiares de Pinheiro et al., 2005 e AlertaRio, 2013, calibrados para o Rio de Janeiro). Não é classificação oficial de risco.";
  var AVISO_INFORMATIVO = "Indicadores pluviométricos de referência. Não substituem vistoria técnica, avaliação de campo ou decisão da autoridade competente.";
  var ACAO_PADRAO = "Critério pluviométrico referencial, não homologado. Evacuação, interdição e demais medidas dependem de decisão da Defesa Civil, com vistoria e avaliação técnica local.";
  var ORIENTACAO_PADRAO = "Acompanhe os comunicados oficiais da Defesa Civil. Se notar trincas, estalos, lama ou movimento do terreno, ligue 199 (Defesa Civil) ou 193 (Bombeiros).";

  // Escala referencial de 5 níveis (0 a 4). Os textos de ação não variam com o nível de propósito.
  var ESTADOS = [
    { nivel: 0, id: "referencial_0", estado: "Referencial 0", corFundo: "#4ade80", corBorda: "#16a34a", corTexto: "#052e16", icone: "🟢",
      faixa1h: "Menor que 10 mm/h", faixa24h: "Menor que 25 mm/24h", faixa168h: "Menor que 50 mm/168h",
      descricao: "Menor que 10 mm/h; Menor que 25 mm/24h; Menor que 50 mm/168h" },
    { nivel: 1, id: "referencial_1", estado: "Referencial 1", corFundo: "#facc15", corBorda: "#ca8a04", corTexto: "#1f2937", icone: "🟡",
      faixa1h: "10 a 20 mm/h", faixa24h: "25 a 50 mm/24h", faixa168h: "50 a 100 mm/168h",
      descricao: "10 a 20 mm/h; 25 a 50mm/24h; 50 a 100 mm/168h" },
    { nivel: 2, id: "referencial_2", estado: "Referencial 2", corFundo: "#f97316", corBorda: "#c2410c", corTexto: "#111827", icone: "🟠",
      faixa1h: "20 a 30 mm/h", faixa24h: "50 a 100 mm/24h", faixa168h: "100 a 150 mm/168h (e 40 mm/h)",
      descricao: "20 a 30 mm/h; 50 a 100mm/24h; 100 a 150mm/168h e 40mm/h" },
    { nivel: 3, id: "referencial_3", estado: "Referencial 3", corFundo: "#991b1b", corBorda: "#7f1d1d", corTexto: "#ffffff", icone: "🔴",
      faixa1h: "30 a 50 mm/h", faixa24h: "100 a 150 mm/24h", faixa168h: "150 a 210 mm/168h e 40 a 80 mm/h",
      descricao: "30 a 50 mm/h; 100 a 150mm/24h; 150 a 210mm/168h e 40 a 80mm/h" },
    { nivel: 4, id: "referencial_4", estado: "Referencial 4", corFundo: "#6b21a8", corBorda: "#581c87", corTexto: "#ffffff", icone: "🟣",
      faixa1h: "Maior que 50 mm/h", faixa24h: "Maior que 150 mm/24h", faixa168h: "Maior que 210 mm/168h e maior que 80 mm/h",
      descricao: "Maior que 50mm/h; Maior que 150mm/24h; Maior que 210mm/168h e maior que 80mm/h" }
  ];
  ESTADOS.forEach(function (e) {
    e.acaoDefesaCivil = ACAO_PADRAO;
    e.orientacaoPopulacao = ORIENTACAO_PADRAO;
  });

  // Sem dados suficientes para concluir: nunca é apresentado como normalidade.
  var SEM_DADOS = {
    nivel: null, id: "sem_dados", estado: "Dados insuficientes", corFundo: "#9ca3af", corBorda: "#6b7280", corTexto: "#111827", icone: "⚪",
    descricao: "Não há dados válidos e completos nas três janelas (1h, 24h e 168h)",
    acaoDefesaCivil: "Sem dados pluviométricos suficientes para qualquer classificação. Ausência de dado não indica ausência de chuva nem de risco.",
    orientacaoPopulacao: ORIENTACAO_PADRAO
  };

  // Número válido (>= 0) ou null. Ausente, vazio ou inválido NUNCA vira 0.
  function nValido(v) {
    if (v === null || v === undefined || v === "") return null;
    var n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
    return isFinite(n) && n >= 0 ? n : null;
  }

  function r1(v) { return v === null ? null : Math.round(v * 10) / 10; }

  // Texto de um volume em mm: "—" quando ausente.
  function fmtMm(v, casas) {
    var n = nValido(v);
    return n === null ? "—" : n.toFixed(casas === undefined ? 1 : casas).replace(".", ",");
  }

  // Classifica apenas pela intensidade horária (mm/h). Retorna null sem dado.
  function classificarPor1h(mm1h) {
    var v = nValido(mm1h);
    if (v === null) return null;
    if (v > 50) return 4;
    if (v >= 30) return 3;
    if (v >= 20) return 2;
    if (v >= 10) return 1;
    return 0;
  }

  // Classifica pelo acumulado em 24 horas (mm/24h). Retorna null sem dado.
  function classificarPor24h(mm24h) {
    var v = nValido(mm24h);
    if (v === null) return null;
    if (v > 150) return 4;
    if (v >= 100) return 3;
    if (v >= 50) return 2;
    if (v >= 25) return 1;
    return 0;
  }

  // Classifica pelo acumulado em 168 horas (mm/168h) e condição combinada com mm/h. Retorna null sem dado de 168h.
  // Sem mm/h válido, só vale o limiar de 168h.
  function classificarPor168h(mm168h, mm1h) {
    var v168 = nValido(mm168h);
    if (v168 === null) return null;
    var v1 = nValido(mm1h);
    if (v1 !== null) {
      if (v168 > 210 && v1 > 80) return 4;
      if (v168 >= 150 && v1 >= 40) return 3;
      if (v168 >= 100 && v1 >= 40) return 2;
    }
    if (v168 > 210) return 4;
    if (v168 >= 150) return 3;
    if (v168 >= 100) return 2;
    if (v168 >= 50) return 1;
    return 0;
  }

  function estadoJanela(n) { return n === null ? "Sem dado" : ESTADOS[n].estado; }
  function corJanela(n) { return n === null ? SEM_DADOS.corFundo : ESTADOS[n].corFundo; }

  // Avalia as janelas 1h, 24h e 168h. Só classifica de forma conclusiva se as TRÊS tiverem dado válido e completo.
  // Entrada: { mm1h, mm24h, mm168h, fonte, tipo, incompletas: ["1h" | "24h" | "168h"], parcial: { mm24h, mm168h } }
  // - valor ausente (null/undefined/"") permanece ausente;
  // - janela listada em "incompletas" tem o valor descartado (cobertura insuficiente) e só aparece como mínimo parcial.
  function avaliarRisco(dados) {
    var d = dados || {};
    var inc = Array.isArray(d.incompletas) ? d.incompletas : [];
    var parcialIn = d.parcial || {};
    var mm1h = inc.indexOf("1h") > -1 ? null : r1(nValido(d.mm1h));
    var mm24h = inc.indexOf("24h") > -1 ? null : r1(nValido(d.mm24h));
    var mm168h = inc.indexOf("168h") > -1 ? null : r1(nValido(d.mm168h));
    var parcial = {
      mm1h: inc.indexOf("1h") > -1 ? r1(nValido(parcialIn.mm1h !== undefined ? parcialIn.mm1h : d.mm1h)) : null,
      mm24h: inc.indexOf("24h") > -1 ? r1(nValido(parcialIn.mm24h !== undefined ? parcialIn.mm24h : d.mm24h)) : null,
      mm168h: inc.indexOf("168h") > -1 ? r1(nValido(parcialIn.mm168h !== undefined ? parcialIn.mm168h : d.mm168h)) : null
    };

    var nv1h = classificarPor1h(mm1h);
    var nv24h = classificarPor24h(mm24h);
    var nv168h = classificarPor168h(mm168h, mm1h);

    var faltando = [];
    if (nv1h === null) faltando.push("1h");
    if (nv24h === null) faltando.push("24h");
    if (nv168h === null) faltando.push("168h");
    var conclusivo = faltando.length === 0;

    var info, nivelFinal = null, gatilhos = [];
    if (conclusivo) {
      nivelFinal = Math.max(nv1h, nv24h, nv168h);
      info = ESTADOS[nivelFinal];
      if (nv1h === nivelFinal && nivelFinal > 0) gatilhos.push("Intensidade 1h (" + fmtMm(mm1h) + " mm/h → " + ESTADOS[nv1h].estado + ")");
      if (nv24h === nivelFinal && nivelFinal > 0) gatilhos.push("Acumulado 24h (" + fmtMm(mm24h) + " mm/24h → " + ESTADOS[nv24h].estado + ")");
      if (nv168h === nivelFinal && nivelFinal > 0) gatilhos.push("Acumulado 168h / 7 dias (" + fmtMm(mm168h) + " mm/168h → " + ESTADOS[nv168h].estado + ")");
      if (!gatilhos.length) gatilhos.push("Todos os volumes abaixo dos limiares referenciais (< 10 mm/h, < 25 mm/24h e < 50 mm/168h)");
    } else {
      info = SEM_DADOS;
      gatilhos.push("Dados insuficientes: janela(s) sem dado válido ou incompleta(s): " + faltando.join(", ") + ".");
      (Array.isArray(d.motivos) ? d.motivos : []).forEach(function (m) { gatilhos.push("Motivo: " + m); });
      if (nv1h !== null) gatilhos.push("Indicador isolado 1h (" + fmtMm(mm1h) + " mm/h → " + ESTADOS[nv1h].estado + ") — não conclusivo");
      if (nv24h !== null) gatilhos.push("Indicador isolado 24h (" + fmtMm(mm24h) + " mm/24h → " + ESTADOS[nv24h].estado + ") — não conclusivo");
      if (nv168h !== null) gatilhos.push("Indicador isolado 168h (" + fmtMm(mm168h) + " mm/168h → " + ESTADOS[nv168h].estado + ") — não conclusivo");
      if (parcial.mm24h !== null) gatilhos.push("Mínimo parcial 24h: " + fmtMm(parcial.mm24h) + " mm (cobertura incompleta)");
      if (parcial.mm168h !== null) gatilhos.push("Mínimo parcial 168h: " + fmtMm(parcial.mm168h) + " mm (cobertura incompleta)");
    }

    return {
      nivel: nivelFinal,
      conclusivo: conclusivo,
      semDados: !conclusivo,
      janelasSemDado: faltando,
      codigo: conclusivo ? "OK" : "SEM_DADOS_SUFICIENTES",
      motivoIndisponibilidade: conclusivo ? "" : (Array.isArray(d.motivos) && d.motivos.length ? d.motivos.join(" | ") : "janela(s) sem dado válido: " + faltando.join(", ")),
      cobertura: d.cobertura || null,
      aviso: AVISO_INFORMATIVO,
      criterioOficial: false,
      avisoCriterio: AVISO_CRITERIO,
      tipoDado: d.tipo || "medicao",
      id: info.id,
      estado: info.estado,
      corFundo: info.corFundo,
      corBorda: info.corBorda,
      corTexto: info.corTexto,
      icone: info.icone,
      descricaoCriterio: info.descricao,
      acaoDefesaCivil: info.acaoDefesaCivil,
      orientacaoPopulacao: info.orientacaoPopulacao,
      mm1h: mm1h,
      mm24h: mm24h,
      mm168h: mm168h,
      parcial: parcial,
      nivel1h: nv1h,
      estado1h: estadoJanela(nv1h),
      cor1h: corJanela(nv1h),
      nivel24h: nv24h,
      estado24h: estadoJanela(nv24h),
      cor24h: corJanela(nv24h),
      nivel168h: nv168h,
      estado168h: estadoJanela(nv168h),
      cor168h: corJanela(nv168h),
      gatilhos: gatilhos,
      fonte: d.fonte || "Análise Pluviométrica"
    };
  }

  // Indicadores de uma estação num dia, com JANELAS MÓVEIS validadas por cobertura (Estacao.janelasDoDia):
  // 1h = maior acumulado em 60 min do dia, 24h e 168h = acumulados móveis que terminam na última hora com leitura do dia.
  // A chuva do dia civil NÃO é usada como 24h. Janela sem cobertura horária completa e sem lacunas vira "sem dados
  // suficientes" com o motivo; nunca uma soma parcial apresentada como completa.
  function avaliarDiaEstacao(diasMap, dataIso, nomeEstacao) {
    if (!diasMap || !dataIso || !diasMap[dataIso]) return null;
    var E = w.Estacao;
    var fonteBase = (nomeEstacao || "Estação Local") + " (" + dataIso.slice(8, 10) + "/" + dataIso.slice(5, 7);
    if (!E || typeof E.janelasDoDia !== "function") {
      return avaliarRisco({ tipo: "medicao", incompletas: ["1h", "24h", "168h"], motivos: ["módulo de estações indisponível nesta página"], fonte: fonteBase + ")" });
    }
    var j = E.janelasDoDia(diasMap, dataIso);
    var incompletas = [], motivos = [];
    [["1h", j.max60, "maior acumulado em 60 min"], ["24h", j.mov24, "acumulado móvel de 24 h"], ["168h", j.mov168, "acumulado móvel de 168 h"]].forEach(function (x) {
      if (x[1].estado !== "OK") { incompletas.push(x[0]); motivos.push(x[2] + ": " + (x[1].motivo || "sem dados")); }
    });
    var res = avaliarRisco({
      mm1h: j.max60.valor,
      mm24h: j.mov24.valor,
      mm168h: j.mov168.valor,
      parcial: { mm1h: j.max60.minimoParcial, mm24h: j.mov24.minimoParcial, mm168h: j.mov168.minimoParcial },
      incompletas: incompletas,
      motivos: motivos,
      tipo: "medicao",
      cobertura: j,
      fonte: fonteBase + " · janela até " + j.fimRotulo + ")"
    });
    res.dataIso = dataIso;
    res.diasJanela168h = j.mov168.diasComDado;
    res.janelas = j;
    return res;
  }

  function somaJanela(p, de, ate) {
    var soma = 0, n = 0;
    for (var i = Math.max(0, de); i <= ate; i++) {
      if (typeof p[i] === "number" && isFinite(p[i])) { soma += p[i]; n++; }
    }
    return { soma: soma, n: n };
  }

  // Volumes a partir da série horária do Open-Meteo (past_days=7). Os valores passados são ESTIMATIVA DE MODELO
  // (não são medição de pluviômetro) e a projeção é PREVISÃO. Hora ausente na série não vira 0 mm.
  function extrairDeSerieHoraria(hourly, horaAtualIso) {
    if (!hourly || !Array.isArray(hourly.time) || !Array.isArray(hourly.precipitation)) return null;
    var alvoHora = String(horaAtualIso || "").slice(0, 13) + ":00";
    var idxAgora = hourly.time.indexOf(alvoHora);
    var horaLocalizada = idxAgora >= 0;
    if (!horaLocalizada) idxAgora = Math.max(0, hourly.time.length - 25);

    var p = hourly.precipitation;
    var mm1h = typeof p[idxAgora] === "number" ? p[idxAgora] : null;
    var j24 = somaJanela(p, idxAgora - 23, idxAgora);
    var j168 = somaJanela(p, idxAgora - 167, idxAgora);

    var incAtual = [];
    if (!horaLocalizada || mm1h === null) incAtual.push("1h");
    if (!horaLocalizada || j24.n < 24) incAtual.push("24h");
    if (!horaLocalizada || j168.n < 168) incAtual.push("168h");

    var atual = avaliarRisco({
      mm1h: mm1h, mm24h: j24.n ? j24.soma : null, mm168h: j168.n ? j168.soma : null,
      parcial: { mm24h: j24.n ? j24.soma : null, mm168h: j168.n ? j168.soma : null },
      incompletas: incAtual, tipo: "modelo",
      fonte: "Estimativa de modelo Open-Meteo (1h / 24h / 168h) — não é medição"
    });

    // Projeção: previsão das próximas 24h (apenas o futuro) somada ao acumulado passado deslocado.
    var max1hProx24 = null, somaProx24 = 0, nProx = 0;
    for (var k = idxAgora + 1; k <= Math.min(hourly.time.length - 1, idxAgora + 24); k++) {
      if (typeof p[k] === "number" && isFinite(p[k])) {
        somaProx24 += p[k];
        nProx++;
        if (max1hProx24 === null || p[k] > max1hProx24) max1hProx24 = p[k];
      }
    }
    var incProj = [];
    if (!horaLocalizada || nProx < 24) incProj.push("1h", "24h");
    if (!horaLocalizada || nProx < 24 || j24.n < 24 || j168.n < 168) incProj.push("168h");
    var base168 = (j168.n && j24.n) ? j168.soma - j24.soma + somaProx24 : null;

    return {
      atual: atual,
      projecao24h: avaliarRisco({
        mm1h: max1hProx24,
        mm24h: nProx ? somaProx24 : null,
        mm168h: base168,
        incompletas: incProj, tipo: "previsao",
        fonte: "Previsão do modelo para as próximas 24h — não é medição"
      })
    };
  }

  // Observação manual: cada leitura vale SÓ para a janela que declara (1 h, 24 h ou 168 h). Janelas não são somadas,
  // convertidas nem copiadas entre si; leitura sem janela declarada não é classificada. Para completar as três janelas
  // usa-se, por janela, a leitura mais recente do mesmo local DECLARADA naquela janela e dentro do seu alcance.
  var JANELAS_OBS = { "1 h": { chave: "mm1h", ms: 3600000 }, "24 h": { chave: "mm24h", ms: 24 * 3600000 }, "168 h": { chave: "mm168h", ms: 168 * 3600000 } };

  function avaliarObservacaoManual(r, todas) {
    if (!r || nValido(r.chuvaMm) === null || !JANELAS_OBS[r.janela]) return null;
    var tRef = new Date(r.quando).getTime();
    var locNorm = String(r.local || "").trim().toLowerCase();
    var dados = { tipo: "medicao", fonte: r.local };
    var maisRecente = {};
    (todas || []).forEach(function (o) {
      var j = JANELAS_OBS[o.janela];
      if (!j || nValido(o.chuvaMm) === null) return;
      if (String(o.local || "").trim().toLowerCase() !== locNorm) return;
      var t = new Date(o.quando).getTime();
      var dt = tRef - t;
      if (!isFinite(dt) || dt < 0 || dt > j.ms) return;
      if (maisRecente[j.chave] === undefined || t > maisRecente[j.chave]) {
        maisRecente[j.chave] = t;
        dados[j.chave] = o.chuvaMm;
      }
    });
    dados[JANELAS_OBS[r.janela].chave] = r.chuvaMm;
    return avaliarRisco(dados);
  }

  w.Deslizamento = {
    ESTADOS: ESTADOS,
    SEM_DADOS: SEM_DADOS,
    AVISO_CRITERIO: AVISO_CRITERIO,
    AVISO_INFORMATIVO: AVISO_INFORMATIVO,
    fmtMm: fmtMm,
    nValido: nValido,
    classificarPor1h: classificarPor1h,
    classificarPor24h: classificarPor24h,
    classificarPor168h: classificarPor168h,
    avaliarRisco: avaliarRisco,
    avaliarDiaEstacao: avaliarDiaEstacao,
    avaliarObservacaoManual: avaliarObservacaoManual,
    extrairDeSerieHoraria: extrairDeSerieHoraria
  };
})(typeof window !== "undefined" ? window : globalThis);
